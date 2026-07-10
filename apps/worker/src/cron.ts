import { d1Driver } from '@studyos/db/adapters/d1';
import type { Env } from './env';

// Matches the wrangler cron cadence (*/5): a reminder is picked up by exactly
// one tick as long as ticks are not skipped.
const REMINDER_WINDOW_MS = 5 * 60 * 1000;
const JWT_TTL_S = 12 * 60 * 60;

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeSegment(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

// Structural subset of WebCrypto's JsonWebKey (the global name is not exposed
// by the bun type setup here).
interface EcPrivateJwk {
  kty?: string;
  crv?: string;
  d?: string;
  x?: string;
  y?: string;
  ext?: boolean;
  key_ops?: string[];
}

async function importVapidPrivateKey(jwkJson: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkJson) as EcPrivateJwk;
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

/**
 * RFC 8292 VAPID JWT (ES256): aud = push service origin, exp <= 24h.
 * WebCrypto ECDSA signatures are already the raw r||s concatenation JWS wants.
 */
async function vapidJwt(key: CryptoKey, aud: string, sub: string, nowMs: number): Promise<string> {
  const header = encodeSegment({ typ: 'JWT', alg: 'ES256' });
  const claims = encodeSegment({ aud, exp: Math.floor(nowMs / 1000) + JWT_TTL_S, sub });
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

/**
 * Cron tick: if any reminder came due in the last window, send a payload-less
 * web push (RFC 8030; no body, so no content encryption) to every subscription.
 * The service worker shows a generic notification. 404/410 responses drop the
 * subscription; other per-subscription failures are swallowed so one bad
 * endpoint never blocks the rest.
 */
export async function handleCron(env: Env): Promise<void> {
  const db = d1Driver(env.DB);
  const now = Date.now();

  const due = await db.exec(
    'SELECT id FROM reminders WHERE notify_at >= ? AND notify_at <= ? AND deleted_at IS NULL',
    [now - REMINDER_WINDOW_MS, now],
  );
  if (due.length === 0) return;

  const subs = await db.exec('SELECT id, endpoint FROM push_subscriptions');
  if (subs.length === 0) return;

  const key = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY);
  const jwtByOrigin = new Map<string, string>();

  for (const sub of subs) {
    const id = sub['id'] as string;
    const endpoint = sub['endpoint'] as string;
    try {
      const origin = new URL(endpoint).origin;
      let jwt = jwtByOrigin.get(origin);
      if (jwt === undefined) {
        jwt = await vapidJwt(key, origin, env.VAPID_SUBJECT, now);
        jwtByOrigin.set(origin, jwt);
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          TTL: '300',
          Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        },
      });
      if (res.status === 404 || res.status === 410) {
        await db.exec('DELETE FROM push_subscriptions WHERE id = ?', [id]);
      }
    } catch (err) {
      // oxlint-disable-next-line no-console
      console.error(`web push to subscription ${id} failed`, err);
    }
  }
}
