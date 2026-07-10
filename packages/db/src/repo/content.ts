import { newId, now, type ContentItemRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface AttachContentInput {
  topic_id: string;
  source: string;
  external_id?: string | null;
  url?: string | null;
  title: string;
  kind: string;
  meta_json?: string | null;
}

function rowToContentItem(r: Row): ContentItemRow {
  return {
    id: r['id'] as string,
    topic_id: (r['topic_id'] ?? null) as string | null,
    source: r['source'] as string,
    external_id: (r['external_id'] ?? null) as string | null,
    url: (r['url'] ?? null) as string | null,
    title: r['title'] as string,
    kind: r['kind'] as string,
    meta_json: (r['meta_json'] ?? null) as string | null,
    added_at: r['added_at'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function attachContent(
  db: DbDriver,
  deviceId: string,
  input: AttachContentInput,
): Promise<ContentItemRow> {
  const ts = now();
  const item = {
    id: newId(),
    topic_id: input.topic_id,
    source: input.source,
    external_id: input.external_id ?? null,
    url: input.url ?? null,
    title: input.title,
    kind: input.kind,
    meta_json: input.meta_json ?? null,
    added_at: ts,
    updated_at: ts,
    deleted_at: null,
  } satisfies ContentItemRow;
  await localWrite(db, 'content_items', item, deviceId);
  return item;
}

export async function getContent(db: DbDriver, id: string): Promise<ContentItemRow | null> {
  const rows = await db.exec('SELECT * FROM content_items WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToContentItem(r) : null;
}

export async function listContentByTopic(db: DbDriver, topicId: string): Promise<ContentItemRow[]> {
  const rows = await db.exec(
    'SELECT * FROM content_items WHERE topic_id = ? AND deleted_at IS NULL ' +
      'ORDER BY added_at DESC, id DESC',
    [topicId],
  );
  return rows.map(rowToContentItem);
}

/** Soft delete: on the wire this is an upsert with deleted_at set (docs/SYNC.md). */
export async function deleteContent(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getContent(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'content_items', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
