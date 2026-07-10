import { newId, now, type RoutineRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateRoutineInput {
  title: string;
  track_id?: string | null;
  rrule: string;
  start_time: string;
  duration_min: number;
}

export interface RoutinePatch {
  title?: string;
  track_id?: string | null;
  rrule?: string;
  start_time?: string;
  duration_min?: number;
  active?: number;
}

function rowToRoutine(r: Row): RoutineRow {
  return {
    id: r['id'] as string,
    title: r['title'] as string,
    track_id: (r['track_id'] ?? null) as string | null,
    rrule: r['rrule'] as string,
    start_time: r['start_time'] as string,
    duration_min: r['duration_min'] as number,
    active: r['active'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function createRoutine(
  db: DbDriver,
  deviceId: string,
  input: CreateRoutineInput,
): Promise<RoutineRow> {
  const routine = {
    id: newId(),
    title: input.title,
    track_id: input.track_id ?? null,
    rrule: input.rrule,
    start_time: input.start_time,
    duration_min: input.duration_min,
    active: 1,
    updated_at: now(),
    deleted_at: null,
  } satisfies RoutineRow;
  await localWrite(db, 'routines', routine, deviceId);
  return routine;
}

export async function getRoutine(db: DbDriver, id: string): Promise<RoutineRow | null> {
  const rows = await db.exec('SELECT * FROM routines WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToRoutine(r) : null;
}

export async function listRoutines(db: DbDriver): Promise<RoutineRow[]> {
  const rows = await db.exec(
    'SELECT * FROM routines WHERE active = 1 AND deleted_at IS NULL ' +
      'ORDER BY start_time ASC, id ASC',
  );
  return rows.map(rowToRoutine);
}

export async function updateRoutine(
  db: DbDriver,
  deviceId: string,
  id: string,
  patch: RoutinePatch,
): Promise<RoutineRow | null> {
  const existing = await getRoutine(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, ...patch, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'routines', updated, deviceId);
  return updated;
}

export async function deleteRoutine(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getRoutine(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'routines', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
