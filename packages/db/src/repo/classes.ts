import { newId, now, type ClassRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateClassInput {
  track_id: string;
  name: string;
  share_id: string;
}

function rowToClass(r: Row): ClassRow {
  return {
    id: r['id'] as string,
    track_id: r['track_id'] as string,
    name: r['name'] as string,
    share_id: r['share_id'] as string,
    created_at: r['created_at'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function createClass(
  db: DbDriver,
  deviceId: string,
  input: CreateClassInput,
): Promise<ClassRow> {
  const ts = now();
  const cls = {
    id: newId(),
    track_id: input.track_id,
    name: input.name,
    share_id: input.share_id,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  } satisfies ClassRow;
  await localWrite(db, 'classes', cls, deviceId);
  return cls;
}

export async function listClasses(db: DbDriver, trackId: string): Promise<ClassRow[]> {
  const rows = await db.exec(
    'SELECT * FROM classes WHERE track_id = ? AND deleted_at IS NULL ' +
      'ORDER BY created_at ASC, id ASC',
    [trackId],
  );
  return rows.map(rowToClass);
}

/** Soft delete: the share object stays valid — only the local record goes. */
export async function deleteClass(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const rows = await db.exec('SELECT * FROM classes WHERE id = ?', [id]);
  const r = rows[0];
  if (!r || r['deleted_at'] !== null) return;
  const existing = rowToClass(r);
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'classes', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
