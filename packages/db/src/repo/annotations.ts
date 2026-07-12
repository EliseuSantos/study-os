import { newId, now, type AnnotationRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateAnnotationInput {
  content_item_id: string;
  kind?: string; // 'highlight'
  anchor_json: string;
  note_md?: string | null;
}

function rowToAnnotation(r: Row): AnnotationRow {
  return {
    id: r['id'] as string,
    content_item_id: r['content_item_id'] as string,
    kind: r['kind'] as string,
    anchor_json: r['anchor_json'] as string,
    note_md: (r['note_md'] ?? null) as string | null,
    created_at: r['created_at'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function createAnnotation(
  db: DbDriver,
  deviceId: string,
  input: CreateAnnotationInput,
): Promise<AnnotationRow> {
  const ts = now();
  const annotation = {
    id: newId(),
    content_item_id: input.content_item_id,
    kind: input.kind ?? 'highlight',
    anchor_json: input.anchor_json,
    note_md: input.note_md ?? null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  } satisfies AnnotationRow;
  await localWrite(db, 'annotations', annotation, deviceId);
  return annotation;
}

export async function getAnnotation(db: DbDriver, id: string): Promise<AnnotationRow | null> {
  const rows = await db.exec('SELECT * FROM annotations WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToAnnotation(r) : null;
}

export async function listAnnotations(
  db: DbDriver,
  contentItemId: string,
): Promise<AnnotationRow[]> {
  const rows = await db.exec(
    'SELECT * FROM annotations WHERE content_item_id = ? AND deleted_at IS NULL ' +
      'ORDER BY created_at ASC, id ASC',
    [contentItemId],
  );
  return rows.map(rowToAnnotation);
}

export async function setAnnotationNote(
  db: DbDriver,
  deviceId: string,
  id: string,
  noteMd: string | null,
): Promise<AnnotationRow | null> {
  const existing = await getAnnotation(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, note_md: noteMd, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'annotations', updated, deviceId);
  return updated;
}

/** Soft delete: on the wire this is an upsert with deleted_at set (docs/SYNC.md). */
export async function deleteAnnotation(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getAnnotation(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'annotations', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
