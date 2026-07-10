import { newId, now, type TrackRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateTrackInput {
  title: string;
  goal_id?: string | null;
  description?: string | null;
  mode?: string;
}

export interface TrackPatch {
  title?: string;
  description?: string | null;
  mode?: string;
  goal_id?: string | null;
}

function rowToTrack(r: Row): TrackRow {
  return {
    id: r['id'] as string,
    goal_id: (r['goal_id'] ?? null) as string | null,
    title: r['title'] as string,
    description: (r['description'] ?? null) as string | null,
    mode: r['mode'] as string,
    origin: (r['origin'] ?? null) as string | null,
    origin_version: (r['origin_version'] ?? null) as string | null,
    created_at: r['created_at'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function createTrack(
  db: DbDriver,
  deviceId: string,
  input: CreateTrackInput,
): Promise<TrackRow> {
  const ts = now();
  const track = {
    id: newId(),
    goal_id: input.goal_id ?? null,
    title: input.title,
    description: input.description ?? null,
    mode: input.mode ?? 'schedule',
    origin: null,
    origin_version: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  } satisfies TrackRow;
  await localWrite(db, 'tracks', track, deviceId);
  return track;
}

export async function getTrack(db: DbDriver, id: string): Promise<TrackRow | null> {
  const rows = await db.exec('SELECT * FROM tracks WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToTrack(r) : null;
}

export async function listTracks(db: DbDriver): Promise<TrackRow[]> {
  const rows = await db.exec(
    'SELECT * FROM tracks WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC',
  );
  return rows.map(rowToTrack);
}

export async function updateTrack(
  db: DbDriver,
  deviceId: string,
  id: string,
  patch: TrackPatch,
): Promise<TrackRow | null> {
  const existing = await getTrack(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, ...patch, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'tracks', updated, deviceId);
  return updated;
}

export async function deleteTrack(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getTrack(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'tracks', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
