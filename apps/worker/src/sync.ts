import { buildPullStmt, buildPushStmts, rowsToPull } from '@studyos/db/sync/server-core';
import type { OpLogEntry, PushRequest, PushResponse } from '@studyos/shared';
import type { Handler } from 'hono';
import { d1Driver } from '@studyos/db/adapters/d1';
import type { Env } from './env';

function isOpLogEntry(value: unknown): value is OpLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o['tbl'] === 'string' &&
    typeof o['row_id'] === 'string' &&
    (o['op'] === 'upsert' || o['op'] === 'delete') &&
    typeof o['payload'] === 'string' &&
    typeof o['updated_at'] === 'number' &&
    Number.isFinite(o['updated_at']) &&
    typeof o['device_id'] === 'string'
  );
}

function parsePushRequest(value: unknown): PushRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  if (typeof o['device_id'] !== 'string') return null;
  if (!Array.isArray(o['ops']) || !o['ops'].every(isOpLogEntry)) return null;
  return { device_id: o['device_id'], ops: o['ops'] };
}

export const handlePush: Handler<{ Bindings: Env }> = async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const push = parsePushRequest(body);
  if (!push) return c.json({ error: 'malformed push request' }, 400);

  let stmts;
  try {
    stmts = buildPushStmts(push.ops);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'invalid ops' }, 400);
  }
  await d1Driver(c.env.DB).batch(stmts);

  const res: PushResponse = { accepted: push.ops.length };
  return c.json(res);
};

export const handlePull: Handler<{ Bindings: Env }> = async (c) => {
  const device = c.req.query('device');
  if (!device) return c.json({ error: 'device query param is required' }, 400);

  const sinceRaw = c.req.query('since');
  const since = sinceRaw === undefined || sinceRaw === '' ? 0 : Number(sinceRaw);
  if (!Number.isInteger(since) || since < 0) {
    return c.json({ error: 'since must be a non-negative integer' }, 400);
  }

  const stmt = buildPullStmt(since, device);
  const rows = await d1Driver(c.env.DB).exec(stmt.sql, stmt.params);
  return c.json(rowsToPull(rows, since));
};
