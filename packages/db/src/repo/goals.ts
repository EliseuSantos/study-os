import { newId, now, type GoalRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';

export interface CreateGoalInput {
  title: string;
  description?: string | null;
  target_date?: number | null;
  track_id?: string | null;
}

export interface GoalPatch {
  title?: string;
  description?: string | null;
  target_date?: number | null;
  track_id?: string | null;
  status?: string;
}

function rowToGoal(r: Row): GoalRow {
  return {
    id: r['id'] as string,
    title: r['title'] as string,
    description: (r['description'] ?? null) as string | null,
    target_date: (r['target_date'] ?? null) as number | null,
    track_id: (r['track_id'] ?? null) as string | null,
    status: r['status'] as string,
    created_at: r['created_at'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

// max(now, prev + 1) keeps updated_at strictly increasing so same-millisecond
// edits still pass the strict-> LWW guard.
function bumpedTs(prev: number): number {
  return Math.max(now(), prev + 1);
}

export async function createGoal(
  db: DbDriver,
  deviceId: string,
  input: CreateGoalInput,
): Promise<GoalRow> {
  const ts = now();
  const goal = {
    id: newId(),
    title: input.title,
    description: input.description ?? null,
    target_date: input.target_date ?? null,
    track_id: input.track_id ?? null,
    status: 'active',
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  } satisfies GoalRow;
  await localWrite(db, 'goals', goal, deviceId);
  return goal;
}

export async function getGoal(db: DbDriver, id: string): Promise<GoalRow | null> {
  const rows = await db.exec('SELECT * FROM goals WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToGoal(r) : null;
}

export async function listGoals(db: DbDriver): Promise<GoalRow[]> {
  const rows = await db.exec(
    'SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC',
  );
  return rows.map(rowToGoal);
}

export async function updateGoal(
  db: DbDriver,
  deviceId: string,
  id: string,
  patch: GoalPatch,
): Promise<GoalRow | null> {
  const existing = await getGoal(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, ...patch, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'goals', updated, deviceId);
  return updated;
}

/** Soft delete: on the wire this is an upsert with deleted_at set (docs/SYNC.md). */
export async function deleteGoal(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getGoal(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'goals', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}

/** Next upcoming dated goal linked to the track — the "exam" for exam mode. */
export async function examGoalForTrack(
  db: DbDriver,
  trackId: string,
  nowMs: number,
): Promise<GoalRow | null> {
  const rows = await db.exec(
    "SELECT * FROM goals WHERE track_id = ? AND status != 'done' AND deleted_at IS NULL " +
      'AND target_date IS NOT NULL AND target_date >= ? ORDER BY target_date ASC LIMIT 1',
    [trackId, nowMs],
  );
  const r = rows[0];
  return r ? rowToGoal(r) : null;
}

/** Track of a review ref: direct for topics, via the card's topic for cards. */
export async function trackIdForRef(
  db: DbDriver,
  refKind: string,
  refId: string,
): Promise<string | null> {
  const sql =
    refKind === 'topic'
      ? 'SELECT track_id FROM topics WHERE id = ?'
      : 'SELECT t.track_id AS track_id FROM cards c JOIN topics t ON t.id = c.topic_id WHERE c.id = ?';
  const rows = await db.exec(sql, [refId]);
  return (rows[0]?.['track_id'] ?? null) as string | null;
}
