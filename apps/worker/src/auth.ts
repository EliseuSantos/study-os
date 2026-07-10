import type { MiddlewareHandler } from 'hono';
import type { Env } from './env';

type SubtleWithTimingSafe = SubtleCrypto & {
  timingSafeEqual?(a: ArrayBufferView, b: ArrayBufferView): boolean;
};

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const subtle = crypto.subtle as SubtleWithTimingSafe;
  if (typeof subtle.timingSafeEqual === 'function') {
    return a.byteLength === b.byteLength && subtle.timingSafeEqual(a, b);
  }
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export const bearerAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const [given, expected] = await Promise.all([sha256(token), sha256(c.env.SYNC_TOKEN)]);
  if (!constantTimeEqual(given, expected)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
};
