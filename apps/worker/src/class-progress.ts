import type { Handler } from 'hono';
import { d1Driver } from '@studyos/db/adapters/d1';
import type { Env } from './env';

// Anonymous cohort aggregates. POST is public (students have no token) and
// stores one LWW row per (share, anon device). GET is teacher-side (bearer)
// and returns AGGREGATES ONLY, behind a k-anonymity floor of 3 devices.

const K_FLOOR = 3;
const MAX_BODY = 16 * 1024;
const STALE_MS = 30 * 24 * 3_600_000; // rows idle for 30 days drop out

interface ProgressPayload {
  topics_done: number;
  topics_total: number;
  week_minutes: number;
  topics: Record<string, 0 | 1>;
}

function parsePayload(raw: string): ProgressPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const p = data as Record<string, unknown>;
  if (
    typeof p['topics_done'] !== 'number' ||
    typeof p['topics_total'] !== 'number' ||
    typeof p['week_minutes'] !== 'number' ||
    typeof p['topics'] !== 'object' ||
    p['topics'] === null
  ) {
    return null;
  }
  for (const v of Object.values(p['topics'] as Record<string, unknown>)) {
    if (v !== 0 && v !== 1) return null;
  }
  return p as unknown as ProgressPayload;
}

/** POST /class/:shareId/progress — public, one row per anon device (LWW). */
export const handleProgressPost: Handler<{ Bindings: Env }> = async (c) => {
  const shareId = c.req.param('shareId') ?? '';
  const body = await c.req.text();
  if (body.length > MAX_BODY) return c.json({ error: 'payload too large' }, 413);

  let anonId = '';
  let payload: ProgressPayload | null = null;
  try {
    const parsed = JSON.parse(body) as { anon_id?: unknown; payload?: unknown };
    anonId = typeof parsed.anon_id === 'string' ? parsed.anon_id : '';
    payload =
      typeof parsed.payload === 'object' && parsed.payload !== null
        ? parsePayload(JSON.stringify(parsed.payload))
        : null;
  } catch {
    return c.json({ error: 'malformed progress' }, 400);
  }
  if (anonId.length < 16 || anonId.length > 128 || payload === null) {
    return c.json({ error: 'malformed progress' }, 400);
  }

  const db = d1Driver(c.env.DB);
  const shares = await db.exec('SELECT id FROM track_shares WHERE id = ?', [shareId]);
  if (shares.length === 0) return c.json({ error: 'share not found' }, 404);

  await db.exec(
    'INSERT INTO class_progress (share_id, anon_id, payload, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(share_id, anon_id) DO UPDATE SET payload = excluded.payload, ' +
      'updated_at = excluded.updated_at',
    [shareId, anonId, JSON.stringify(payload), Date.now()],
  );
  return c.json({ ok: true });
};

/** GET /class/:shareId/progress — bearer; aggregates only; 204 under the k-floor. */
export const handleProgressGet: Handler<{ Bindings: Env }> = async (c) => {
  // aggregates shift as students report — the browser must never reuse a stale
  // 204/200 across an opt-in (else the teacher's panel stays empty forever)
  c.header('cache-control', 'no-store');
  const shareId = c.req.param('shareId') ?? '';
  const db = d1Driver(c.env.DB);
  const rows = await db.exec(
    'SELECT payload FROM class_progress WHERE share_id = ? AND updated_at >= ?',
    [shareId, Date.now() - STALE_MS],
  );
  if (rows.length < K_FLOOR) return c.body(null, 204);

  const payloads = rows.flatMap((r): ProgressPayload[] => {
    const parsed = parsePayload(r['payload'] as string);
    return parsed === null ? [] : [parsed];
  });
  if (payloads.length < K_FLOOR) return c.body(null, 204);

  const doneCounts = payloads
    .map((p: ProgressPayload) => p.topics_done)
    .toSorted((a: number, b: number) => a - b);
  const mid = Math.floor(doneCounts.length / 2);
  const median =
    doneCounts.length % 2 === 1
      ? (doneCounts[mid] ?? 0)
      : ((doneCounts[mid - 1] ?? 0) + (doneCounts[mid] ?? 0)) / 2;

  const topicDone = new Map<string, number>();
  for (const p of payloads) {
    for (const [sid, done] of Object.entries(p.topics) as [string, 0 | 1][]) {
      topicDone.set(sid, (topicDone.get(sid) ?? 0) + done);
    }
  }
  const topics = [...topicDone.entries()].map(([sid, done]) => ({
    sid,
    done_ratio: done / payloads.length,
  }));

  return c.json({
    count: payloads.length,
    median_done: median,
    avg_week_minutes: Math.round(
      payloads.reduce((n: number, p: ProgressPayload) => n + p.week_minutes, 0) / payloads.length,
    ),
    topics,
  });
};
