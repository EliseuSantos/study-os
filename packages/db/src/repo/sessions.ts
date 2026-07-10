import { newId, now, type SessionRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface StartSessionInput {
  track_id?: string | null;
  topic_id?: string | null;
  type: string;
}

export interface FinishSessionPatch {
  ended_at: number;
  net_seconds: number;
  focused?: number;
  pages_read?: number | null;
  videos_watched?: number | null;
  questions_total?: number | null;
  questions_correct?: number | null;
  notes?: string | null;
}

function rowToSession(r: Row): SessionRow {
  return {
    id: r['id'] as string,
    track_id: (r['track_id'] ?? null) as string | null,
    topic_id: (r['topic_id'] ?? null) as string | null,
    type: r['type'] as string,
    started_at: r['started_at'] as number,
    ended_at: (r['ended_at'] ?? null) as number | null,
    net_seconds: r['net_seconds'] as number,
    focused: r['focused'] as number,
    pages_read: (r['pages_read'] ?? null) as number | null,
    videos_watched: (r['videos_watched'] ?? null) as number | null,
    questions_total: (r['questions_total'] ?? null) as number | null,
    questions_correct: (r['questions_correct'] ?? null) as number | null,
    notes: (r['notes'] ?? null) as string | null,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function startSession(
  db: DbDriver,
  deviceId: string,
  input: StartSessionInput,
): Promise<SessionRow> {
  const ts = now();
  const session = {
    id: newId(),
    track_id: input.track_id ?? null,
    topic_id: input.topic_id ?? null,
    type: input.type,
    started_at: ts,
    ended_at: null,
    net_seconds: 0,
    focused: 0,
    pages_read: null,
    videos_watched: null,
    questions_total: null,
    questions_correct: null,
    notes: null,
    updated_at: ts,
    deleted_at: null,
  } satisfies SessionRow;
  await localWrite(db, 'sessions', session, deviceId);
  return session;
}

export async function getSession(db: DbDriver, id: string): Promise<SessionRow | null> {
  const rows = await db.exec('SELECT * FROM sessions WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToSession(r) : null;
}

export async function finishSession(
  db: DbDriver,
  deviceId: string,
  id: string,
  patch: FinishSessionPatch,
): Promise<SessionRow | null> {
  const existing = await getSession(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, ...patch, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'sessions', updated, deviceId);
  return updated;
}

export async function listRecentSessions(db: DbDriver, limit = 20): Promise<SessionRow[]> {
  const rows = await db.exec(
    'SELECT * FROM sessions WHERE deleted_at IS NULL ' +
      'ORDER BY started_at DESC, id DESC LIMIT ?',
    [limit],
  );
  return rows.map(rowToSession);
}
