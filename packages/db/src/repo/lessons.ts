import { newId, now, type LessonItemRow, type LessonRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateLessonInput {
  track_id: string;
  title: string;
  presenter_notes_md?: string | null;
  estimated_duration_min?: number | null;
  position?: number;
}

export interface LessonPatch {
  title?: string;
  presenter_notes_md?: string | null;
  estimated_duration_min?: number | null;
  position?: number;
}

export interface AddLessonItemInput {
  lesson_id: string;
  kind: string;
  topic_id?: string | null;
  content_item_id?: string | null;
  body_md?: string | null;
  presenter_notes_md?: string | null;
  position?: number;
}

export interface LessonItemPatch {
  kind?: string;
  topic_id?: string | null;
  content_item_id?: string | null;
  body_md?: string | null;
  presenter_notes_md?: string | null;
  position?: number;
}

function rowToLesson(r: Row): LessonRow {
  return {
    id: r['id'] as string,
    track_id: r['track_id'] as string,
    title: r['title'] as string,
    presenter_notes_md: (r['presenter_notes_md'] ?? null) as string | null,
    estimated_duration_min: (r['estimated_duration_min'] ?? null) as number | null,
    position: r['position'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

function rowToLessonItem(r: Row): LessonItemRow {
  return {
    id: r['id'] as string,
    lesson_id: r['lesson_id'] as string,
    topic_id: (r['topic_id'] ?? null) as string | null,
    content_item_id: (r['content_item_id'] ?? null) as string | null,
    kind: r['kind'] as string,
    body_md: (r['body_md'] ?? null) as string | null,
    presenter_notes_md: (r['presenter_notes_md'] ?? null) as string | null,
    position: r['position'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

async function nextPosition(
  db: DbDriver,
  table: 'lessons' | 'lesson_items',
  fkColumn: 'track_id' | 'lesson_id',
  fkValue: string,
): Promise<number> {
  const rows = await db.exec(
    `SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM ${table} ` +
      `WHERE ${fkColumn} = ? AND deleted_at IS NULL`,
    [fkValue],
  );
  return (rows[0]?.['pos'] ?? 0) as number;
}

export async function createLesson(
  db: DbDriver,
  deviceId: string,
  input: CreateLessonInput,
): Promise<LessonRow> {
  const position =
    input.position ?? (await nextPosition(db, 'lessons', 'track_id', input.track_id));
  const lesson = {
    id: newId(),
    track_id: input.track_id,
    title: input.title,
    presenter_notes_md: input.presenter_notes_md ?? null,
    estimated_duration_min: input.estimated_duration_min ?? null,
    position,
    updated_at: now(),
    deleted_at: null,
  } satisfies LessonRow;
  await localWrite(db, 'lessons', lesson, deviceId);
  return lesson;
}

export async function getLesson(db: DbDriver, id: string): Promise<LessonRow | null> {
  const rows = await db.exec('SELECT * FROM lessons WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToLesson(r) : null;
}

export async function listLessons(db: DbDriver, trackId: string): Promise<LessonRow[]> {
  const rows = await db.exec(
    'SELECT * FROM lessons WHERE track_id = ? AND deleted_at IS NULL ' +
      'ORDER BY position ASC, id ASC',
    [trackId],
  );
  return rows.map(rowToLesson);
}

export async function updateLesson(
  db: DbDriver,
  deviceId: string,
  id: string,
  patch: LessonPatch,
): Promise<LessonRow | null> {
  const existing = await getLesson(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, ...patch, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'lessons', updated, deviceId);
  return updated;
}

/** Soft delete: on the wire this is an upsert with deleted_at set (docs/SYNC.md). */
export async function deleteLesson(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getLesson(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'lessons', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}

export async function addLessonItem(
  db: DbDriver,
  deviceId: string,
  input: AddLessonItemInput,
): Promise<LessonItemRow> {
  const position =
    input.position ?? (await nextPosition(db, 'lesson_items', 'lesson_id', input.lesson_id));
  const item = {
    id: newId(),
    lesson_id: input.lesson_id,
    topic_id: input.topic_id ?? null,
    content_item_id: input.content_item_id ?? null,
    kind: input.kind,
    body_md: input.body_md ?? null,
    presenter_notes_md: input.presenter_notes_md ?? null,
    position,
    updated_at: now(),
    deleted_at: null,
  } satisfies LessonItemRow;
  await localWrite(db, 'lesson_items', item, deviceId);
  return item;
}

export async function getLessonItem(db: DbDriver, id: string): Promise<LessonItemRow | null> {
  const rows = await db.exec('SELECT * FROM lesson_items WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToLessonItem(r) : null;
}

export async function listLessonItems(db: DbDriver, lessonId: string): Promise<LessonItemRow[]> {
  const rows = await db.exec(
    'SELECT * FROM lesson_items WHERE lesson_id = ? AND deleted_at IS NULL ' +
      'ORDER BY position ASC, id ASC',
    [lessonId],
  );
  return rows.map(rowToLessonItem);
}

export async function updateLessonItem(
  db: DbDriver,
  deviceId: string,
  id: string,
  patch: LessonItemPatch,
): Promise<LessonItemRow | null> {
  const existing = await getLessonItem(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, ...patch, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'lesson_items', updated, deviceId);
  return updated;
}

export async function deleteLessonItem(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getLessonItem(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'lesson_items', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
