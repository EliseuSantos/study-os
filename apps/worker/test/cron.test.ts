import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { handleCron } from '../src/cron';
import type { Env } from '../src/env';
import { createFakeD1, type FakeD1 } from './fake-d1';
import { FakeR2 } from './fake-r2';

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const realFetch = globalThis.fetch;

let db: FakeD1;
let env: Env;
let verifyKey: CryptoKey;
let requests: Recorded[];
let responder: (url: string) => Response;

beforeEach(async () => {
  db = await createFakeD1();

  // throwaway keypair per run — never hardcode VAPID keys
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  verifyKey = pair.publicKey;

  env = {
    DB: db,
    SYNC_TOKEN: 'test',
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SHARES: new FakeR2(),
    VAPID_PUBLIC_KEY: base64url(
      new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    ),
    VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    VAPID_SUBJECT: 'mailto:test@example.com',
  };

  requests = [];
  responder = () => new Response(null, { status: 201 });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const flat: Record<string, string> = {};
    headers.forEach((value, key) => {
      flat[key] = value;
    });
    requests.push({ url, method: init?.method ?? 'GET', headers: flat });
    const boom = url.includes('boom');
    if (boom) throw new Error('network down');
    return responder(url);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function insertReminder(
  id: string,
  notifyAt: number,
  deletedAt: number | null = null,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO reminders (id, title, ref_kind, ref_id, notify_at, rrule, updated_at, deleted_at) ' +
        'VALUES (?, ?, NULL, NULL, ?, NULL, ?, ?)',
    )
    .bind(id, 'lembrete', notifyAt, notifyAt, deletedAt)
    .run();
}

async function insertSubscription(id: string, endpoint: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO push_subscriptions (id, device_id, endpoint, p256dh, auth, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(id, id, endpoint, 'p256dh-key', 'auth-secret', Date.now())
    .run();
}

async function subscriptionIds(): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT id FROM push_subscriptions ORDER BY id')
    .bind()
    .all();
  return results.map((r) => r['id'] as string);
}

describe('handleCron', () => {
  test('no reminders in the window means no pushes', async () => {
    await insertSubscription('device-a', 'https://push.example.com/sub/a');
    await insertReminder('r-old', Date.now() - 10 * 60 * 1000); // outside window
    await insertReminder('r-future', Date.now() + 60 * 1000); // not due yet

    await handleCron(env);
    expect(requests).toHaveLength(0);
  });

  test('soft-deleted reminders are ignored', async () => {
    await insertSubscription('device-a', 'https://push.example.com/sub/a');
    await insertReminder('r-deleted', Date.now() - 60 * 1000, Date.now());

    await handleCron(env);
    expect(requests).toHaveLength(0);
  });

  test('sends one payload-less POST per subscription with VAPID auth and TTL', async () => {
    await insertReminder('r1', Date.now() - 60 * 1000);
    await insertSubscription('device-a', 'https://push-a.example.com/sub/a');
    await insertSubscription('device-b', 'https://push-b.example.com/sub/b');

    await handleCron(env);

    expect(requests).toHaveLength(2);
    for (const req of requests) {
      expect(req.method).toBe('POST');
      expect(req.headers['ttl']).toBe('300');
      expect(req.headers['authorization']).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    }

    // JWT is verifiable with the public key and carries the RFC 8292 claims
    const reqA = requests.find((r) => r.url.startsWith('https://push-a.example.com'));
    const auth = reqA?.headers['authorization'] ?? '';
    const jwt = /t=([^,]+),/.exec(auth)?.[1] ?? '';
    const [header = '', claims = '', signature = ''] = jwt.split('.');
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      base64urlDecode(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);

    const decodedHeader = JSON.parse(new TextDecoder().decode(base64urlDecode(header)));
    expect(decodedHeader).toEqual({ typ: 'JWT', alg: 'ES256' });

    const decodedClaims = JSON.parse(new TextDecoder().decode(base64urlDecode(claims))) as {
      aud: string;
      exp: number;
      sub: string;
    };
    expect(decodedClaims.aud).toBe('https://push-a.example.com');
    expect(decodedClaims.sub).toBe('mailto:test@example.com');
    expect(decodedClaims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(decodedClaims.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 24 * 3600);

    const k = / k=([\w-]+)$/.exec(auth)?.[1];
    expect(k).toBe(env.VAPID_PUBLIC_KEY);
  });

  test('410 (and 404) responses delete that subscription only', async () => {
    await insertReminder('r1', Date.now() - 60 * 1000);
    await insertSubscription('device-gone', 'https://push.example.com/sub/gone-410');
    await insertSubscription('device-lost', 'https://push.example.com/sub/lost-404');
    await insertSubscription('device-ok', 'https://push.example.com/sub/ok');

    responder = (url) => {
      if (url.includes('gone-410')) return new Response(null, { status: 410 });
      if (url.includes('lost-404')) return new Response(null, { status: 404 });
      return new Response(null, { status: 201 });
    };

    await handleCron(env);

    expect(requests).toHaveLength(3);
    expect(await subscriptionIds()).toEqual(['device-ok']);
  });

  test('a failing endpoint does not block the other subscriptions', async () => {
    await insertReminder('r1', Date.now() - 60 * 1000);
    await insertSubscription('device-bad', 'https://push.example.com/sub/boom');
    await insertSubscription('device-ok', 'https://push.example.com/sub/ok');

    await handleCron(env);

    expect(requests).toHaveLength(2);
    expect(await subscriptionIds()).toEqual(['device-bad', 'device-ok']);
  });
});
