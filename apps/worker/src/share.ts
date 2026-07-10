import { parseSnapshot, snapshotHash, type TrackSnapshot } from '@studyos/core';
import { d1Driver } from '@studyos/db/adapters/d1';
import type { Handler } from 'hono';
import { cloneResponse, getCache } from './cache';
import type { Env } from './env';

// Synthetic origin for Cache API keys — never fetched, just a stable namespace.
const CACHE_ORIGIN = 'https://cache.studyos';

const MAX_BODY_BYTES = 1_048_576; // 1 MB

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Response(text).body;
  if (!stream) throw new Error('unreachable: Response(text) always has a body');
  return new Response(stream.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}

async function gunzip(buf: ArrayBuffer): Promise<string> {
  const stream = new Response(buf).body;
  if (!stream) throw new Error('unreachable: Response(buf) always has a body');
  return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).text();
}

/** POST /share (bearer): store a validated snapshot, answer `{ id, hash }`. */
export const handleShareCreate: Handler<{ Bindings: Env }> = async (c) => {
  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return c.json({ error: 'snapshot too large' }, 413);
  const body = await c.req.text();
  if (body.length > MAX_BODY_BYTES) return c.json({ error: 'snapshot too large' }, 413);

  let snapshot: TrackSnapshot;
  try {
    snapshot = parseSnapshot(body);
  } catch {
    return c.json({ error: 'invalid snapshot' }, 400);
  }

  const hash = snapshotHash(snapshot);
  const id = hash.slice(0, 10) + randomHex(2);
  const r2Key = `shares/${id}.json.gz`;

  await c.env.SHARES.put(r2Key, await gzip(body));
  await d1Driver(c.env.DB).exec(
    'INSERT INTO track_shares (id, version_hash, r2_key, title, created_at) ' +
      'VALUES (?, ?, ?, ?, ?)',
    [id, hash, r2Key, snapshot.track.title, Date.now()],
  );
  return c.json({ id, hash });
};

/** GET /share/:id — PUBLIC (students import without a token). Cached 1h. */
export const handleShareGet: Handler<{ Bindings: Env }> = async (c) => {
  // Handler is not path-typed (mounted in index.ts), so param() is string | undefined.
  const id = c.req.param('id') ?? '';

  const cache = await getCache();
  const cacheKey = new Request(`${CACHE_ORIGIN}/share/${encodeURIComponent(id)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const rows = await d1Driver(c.env.DB).exec(
    'SELECT version_hash, r2_key FROM track_shares WHERE id = ?',
    [id],
  );
  const row = rows[0];
  if (!row) return c.json({ error: 'share not found' }, 404);

  const object = await c.env.SHARES.get(row['r2_key'] as string);
  if (!object) return c.json({ error: 'share not found' }, 404);

  const json = await gunzip(await object.arrayBuffer());
  const res = new Response(
    JSON.stringify({ snapshot: JSON.parse(json), hash: row['version_hash'] as string }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=3600', // 1h
      },
    },
  );
  await cache.put(cacheKey, cloneResponse(res));
  return res;
};
