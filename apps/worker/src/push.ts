import type { Handler } from 'hono';
import { d1Driver } from '@studyos/db/adapters/d1';
import type { Env } from './env';

interface SubscribeBody {
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function parseSubscribeBody(value: unknown): SubscribeBody | null {
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  if (
    typeof o['device_id'] !== 'string' ||
    typeof o['endpoint'] !== 'string' ||
    typeof o['p256dh'] !== 'string' ||
    typeof o['auth'] !== 'string'
  ) {
    return null;
  }
  return {
    device_id: o['device_id'],
    endpoint: o['endpoint'],
    p256dh: o['p256dh'],
    auth: o['auth'],
  };
}

/** Upsert keyed by device: one subscription per device (id = device_id). */
export const handleSubscribe: Handler<{ Bindings: Env }> = async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const sub = parseSubscribeBody(body);
  if (!sub) return c.json({ error: 'malformed subscribe request' }, 400);

  await d1Driver(c.env.DB).exec(
    'INSERT OR REPLACE INTO push_subscriptions (id, device_id, endpoint, p256dh, auth, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
    [sub.device_id, sub.device_id, sub.endpoint, sub.p256dh, sub.auth, Date.now()],
  );
  return c.json({ ok: true });
};

export const handleVapidKey: Handler<{ Bindings: Env }> = (c) =>
  c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
