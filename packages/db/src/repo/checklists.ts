import { newId, now, type ChecklistItemRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface AddChecklistItemInput {
  ref_kind: string;
  ref_id: string;
  title: string;
  position?: number;
}

function rowToChecklistItem(r: Row): ChecklistItemRow {
  return {
    id: r['id'] as string,
    ref_kind: r['ref_kind'] as string,
    ref_id: r['ref_id'] as string,
    title: r['title'] as string,
    done: r['done'] as number,
    position: r['position'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

async function nextPosition(db: DbDriver, refKind: string, refId: string): Promise<number> {
  const rows = await db.exec(
    'SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM checklist_items ' +
      'WHERE ref_kind = ? AND ref_id = ? AND deleted_at IS NULL',
    [refKind, refId],
  );
  return (rows[0]?.['pos'] ?? 0) as number;
}

export async function addChecklistItem(
  db: DbDriver,
  deviceId: string,
  input: AddChecklistItemInput,
): Promise<ChecklistItemRow> {
  const position = input.position ?? (await nextPosition(db, input.ref_kind, input.ref_id));
  const item = {
    id: newId(),
    ref_kind: input.ref_kind,
    ref_id: input.ref_id,
    title: input.title,
    done: 0,
    position,
    updated_at: now(),
    deleted_at: null,
  } satisfies ChecklistItemRow;
  await localWrite(db, 'checklist_items', item, deviceId);
  return item;
}

export async function getChecklistItem(db: DbDriver, id: string): Promise<ChecklistItemRow | null> {
  const rows = await db.exec('SELECT * FROM checklist_items WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToChecklistItem(r) : null;
}

export async function listChecklist(
  db: DbDriver,
  refKind: string,
  refId: string,
): Promise<ChecklistItemRow[]> {
  const rows = await db.exec(
    'SELECT * FROM checklist_items WHERE ref_kind = ? AND ref_id = ? AND deleted_at IS NULL ' +
      'ORDER BY position ASC, id ASC',
    [refKind, refId],
  );
  return rows.map(rowToChecklistItem);
}

export async function toggleChecklistItem(
  db: DbDriver,
  deviceId: string,
  id: string,
  done: boolean,
): Promise<void> {
  const existing = await getChecklistItem(db, id);
  if (!existing || existing.deleted_at !== null) return;
  await localWrite(
    db,
    'checklist_items',
    { ...existing, done: done ? 1 : 0, updated_at: bumpedTs(existing.updated_at) },
    deviceId,
  );
}

export async function deleteChecklistItem(
  db: DbDriver,
  deviceId: string,
  id: string,
): Promise<void> {
  const existing = await getChecklistItem(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(
    db,
    'checklist_items',
    { ...existing, deleted_at: ts, updated_at: ts },
    deviceId,
  );
}
