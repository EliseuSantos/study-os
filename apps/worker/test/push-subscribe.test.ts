import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../src/index';
import type { Env } from '../src/env';
import { createFakeD1, type FakeD1 } from './fake-d1';

const TOKEN = 'test';
const app = createApp();

let db: FakeD1;
let env: Env;

beforeEach(async () => {
  db = await createFakeD1();
  env = {
    DB: db,
    SYNC_TOKEN: TOKEN,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: '{}',
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
});

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    device_id: 'device-a',
    endpoint: 'https://push.example.com/sub/abc',
    p256dh: 'p256dh-key',
    auth: 'auth-secret',
    ...overrides,
  };
}

async function subscribe(body: unknown, token = TOKEN): Promise<Response> {
  return app.request(
    '/push/subscribe',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  );
}

async function subscriptions(): Promise<Record<string, unknown>[]> {
  const { results } = await db.prepare('SELECT * FROM push_subscriptions').bind().all();
  return results;
}

describe('POST /push/subscribe', () => {
  test('requires bearer auth', async () => {
    const res = await app.request(
      '/push/subscribe',
      { method: 'POST', body: JSON.stringify(validBody()) },
      env,
    );
    expect(res.status).toBe(401);

    const wrong = await subscribe(validBody(), 'wrong-token');
    expect(wrong.status).toBe(401);
    expect(await subscriptions()).toHaveLength(0);
  });

  test('stores the subscription keyed by device_id', async () => {
    const res = await subscribe(validBody());
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });

    const rows = await subscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['id']).toBe('device-a');
    expect(rows[0]?.['device_id']).toBe('device-a');
    expect(rows[0]?.['endpoint']).toBe('https://push.example.com/sub/abc');
    expect(rows[0]?.['p256dh']).toBe('p256dh-key');
    expect(rows[0]?.['auth']).toBe('auth-secret');
    expect(rows[0]?.['created_at']).toBeGreaterThan(0);
  });

  test('subscribing again from the same device replaces the row (upsert)', async () => {
    await subscribe(validBody());
    await subscribe(validBody({ endpoint: 'https://push.example.com/sub/new' }));

    const rows = await subscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['endpoint']).toBe('https://push.example.com/sub/new');
  });

  test('malformed bodies return 400', async () => {
    const cases: unknown[] = [
      {},
      validBody({ device_id: undefined }),
      validBody({ endpoint: undefined }),
      validBody({ p256dh: undefined }),
      validBody({ auth: undefined }),
      validBody({ device_id: 42 }),
      validBody({ endpoint: null }),
      'not json',
    ];
    for (const body of cases) {
      const res = await subscribe(body);
      expect(res.status).toBe(400);
    }
    expect(await subscriptions()).toHaveLength(0);
  });
});

describe('GET /push/vapid', () => {
  test('requires bearer auth', async () => {
    const res = await app.request('/push/vapid', {}, env);
    expect(res.status).toBe(401);
  });

  test('returns the configured public key', async () => {
    const res = await app.request(
      '/push/vapid',
      { headers: { authorization: `Bearer ${TOKEN}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { publicKey: string }).toEqual({
      publicKey: 'test-public-key',
    });
  });
});
