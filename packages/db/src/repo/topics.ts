import { newId, now, type TopicRow } from '@studyos/shared';
import type { DbDriver, Row, Stmt } from '../driver';
import { localWrite, localWriteStmts } from './oplog';
import { bumpedTs } from './ts';

export interface CreateTopicInput {
  track_id: string;
  parent_id?: string | null;
  title: string;
  position?: number;
  notes_md?: string | null;
}

// Structural copy of core's OutlineNode minus depth (encoded by the parent chain);
// db must not depend on @studyos/core.
export interface OutlineNodeInput {
  title: string;
  children: OutlineNodeInput[];
}

export type TopicStatus = 'pending' | 'studying' | 'done';

function rowToTopic(r: Row): TopicRow {
  return {
    id: r['id'] as string,
    track_id: r['track_id'] as string,
    parent_id: (r['parent_id'] ?? null) as string | null,
    title: r['title'] as string,
    notes_md: (r['notes_md'] ?? null) as string | null,
    position: r['position'] as number,
    status: r['status'] as string,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

async function nextSiblingPosition(
  db: DbDriver,
  trackId: string,
  parentId: string | null,
): Promise<number> {
  const rows = await db.exec(
    'SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM topics ' +
      `WHERE track_id = ? AND deleted_at IS NULL AND parent_id ${parentId === null ? 'IS NULL' : '= ?'}`,
    parentId === null ? [trackId] : [trackId, parentId],
  );
  return (rows[0]?.['pos'] ?? 0) as number;
}

export async function createTopic(
  db: DbDriver,
  deviceId: string,
  input: CreateTopicInput,
): Promise<TopicRow> {
  const parentId = input.parent_id ?? null;
  const position = input.position ?? (await nextSiblingPosition(db, input.track_id, parentId));
  const topic = {
    id: newId(),
    track_id: input.track_id,
    parent_id: parentId,
    title: input.title,
    notes_md: input.notes_md ?? null,
    position,
    status: 'pending',
    updated_at: now(),
    deleted_at: null,
  } satisfies TopicRow;
  await localWrite(db, 'topics', topic, deviceId);
  return topic;
}

/** Bulk outline import: the whole forest lands in one atomic batch. */
export async function createTopicTree(
  db: DbDriver,
  deviceId: string,
  trackId: string,
  nodes: OutlineNodeInput[],
): Promise<number> {
  const ts = now();
  const stmts: Stmt[] = [];
  let count = 0;
  const walk = (siblings: OutlineNodeInput[], parentId: string | null): void => {
    siblings.forEach((node, position) => {
      const topic = {
        id: newId(),
        track_id: trackId,
        parent_id: parentId,
        title: node.title,
        notes_md: null,
        position,
        status: 'pending',
        updated_at: ts,
        deleted_at: null,
      } satisfies TopicRow;
      stmts.push(...localWriteStmts('topics', topic, deviceId));
      count += 1;
      walk(node.children, topic.id);
    });
  };
  walk(nodes, null);
  if (stmts.length > 0) await db.batch(stmts);
  return count;
}

export async function getTopic(db: DbDriver, id: string): Promise<TopicRow | null> {
  const rows = await db.exec('SELECT * FROM topics WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToTopic(r) : null;
}

export async function listTopics(db: DbDriver, trackId: string): Promise<TopicRow[]> {
  const rows = await db.exec(
    'SELECT * FROM topics WHERE track_id = ? AND deleted_at IS NULL ORDER BY position ASC, id ASC',
    [trackId],
  );
  return rows.map(rowToTopic);
}

export async function setTopicStatus(
  db: DbDriver,
  deviceId: string,
  id: string,
  status: TopicStatus,
): Promise<void> {
  const existing = await getTopic(db, id);
  if (!existing || existing.deleted_at !== null) return;
  await localWrite(
    db,
    'topics',
    { ...existing, status, updated_at: bumpedTs(existing.updated_at) },
    deviceId,
  );
}

export async function deleteTopic(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getTopic(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'topics', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
