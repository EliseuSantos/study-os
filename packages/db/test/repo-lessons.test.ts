import { expect, test } from 'bun:test';
import {
  addLessonItem,
  createLesson,
  deleteLesson,
  deleteLessonItem,
  getLesson,
  listLessonItems,
  listLessons,
  updateLesson,
  updateLessonItem,
} from '../src/repo/lessons';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('createLesson writes the lesson and exactly one oplog row', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const opsBefore = (await db.exec('SELECT * FROM oplog')).length;

  const lesson = await createLesson(db, DEVICE, { track_id: track.id, title: 'Aula 1' });

  expect(lesson.presenter_notes_md).toBeNull();
  expect(lesson.estimated_duration_min).toBeNull();
  expect(await getLesson(db, lesson.id)).toEqual(lesson);

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'lessons'");
  expect(ops.length).toBe(1);
  expect(ops[0]?.['row_id']).toBe(lesson.id);
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(opsBefore + 1);
});

test('createLesson defaults position to the next index per track', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const other = await createTrack(db, DEVICE, { title: 'other' });

  const a = await createLesson(db, DEVICE, { track_id: track.id, title: 'a' });
  const b = await createLesson(db, DEVICE, { track_id: track.id, title: 'b' });
  const elsewhere = await createLesson(db, DEVICE, { track_id: other.id, title: 'x' });

  expect(a.position).toBe(0);
  expect(b.position).toBe(1);
  expect(elsewhere.position).toBe(0);
});

test('updateLesson patches fields, bumps updated_at and appends an oplog row', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const lesson = await createLesson(db, DEVICE, { track_id: track.id, title: 'antes' });

  const updated = await updateLesson(db, DEVICE, lesson.id, {
    title: 'depois',
    presenter_notes_md: 'falar devagar',
    estimated_duration_min: 45,
  });
  expect(updated?.title).toBe('depois');
  expect(updated?.presenter_notes_md).toBe('falar devagar');
  expect(updated?.estimated_duration_min).toBe(45);
  expect(updated?.updated_at).toBeGreaterThan(lesson.updated_at);

  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'lessons'")).length).toBe(2);
});

test('updateLesson returns null for missing or deleted lessons', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  expect(await updateLesson(db, DEVICE, 'nope', { title: 'x' })).toBeNull();

  const lesson = await createLesson(db, DEVICE, { track_id: track.id, title: 'gone' });
  await deleteLesson(db, DEVICE, lesson.id);
  expect(await updateLesson(db, DEVICE, lesson.id, { title: 'x' })).toBeNull();
});

test('listLessons hides soft-deleted lessons and orders by position', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const first = await createLesson(db, DEVICE, { track_id: track.id, title: 'a', position: 1 });
  const second = await createLesson(db, DEVICE, { track_id: track.id, title: 'b', position: 0 });
  const gone = await createLesson(db, DEVICE, { track_id: track.id, title: 'c' });

  await deleteLesson(db, DEVICE, gone.id);

  const visible = await listLessons(db, track.id);
  expect(visible.map((l) => l.id)).toEqual([second.id, first.id]);
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'lessons'")).length).toBe(4);
});

test('addLessonItem defaults position per lesson and writes one oplog row each', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const lesson = await createLesson(db, DEVICE, { track_id: track.id, title: 'a' });

  const intro = await addLessonItem(db, DEVICE, {
    lesson_id: lesson.id,
    kind: 'note',
    body_md: 'boas-vindas',
  });
  const quiz = await addLessonItem(db, DEVICE, {
    lesson_id: lesson.id,
    kind: 'quiz',
    body_md: '{"q":"2+2?","options":["3","4"],"answer":2}',
  });

  expect(intro.position).toBe(0);
  expect(quiz.position).toBe(1);
  expect(intro.topic_id).toBeNull();
  expect(intro.content_item_id).toBeNull();

  const items = await listLessonItems(db, lesson.id);
  expect(items.map((i) => i.id)).toEqual([intro.id, quiz.id]);
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'lesson_items'")).length).toBe(2);
});

test('updateLessonItem swaps positions (reorder) and bumps updated_at', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const lesson = await createLesson(db, DEVICE, { track_id: track.id, title: 'a' });
  const first = await addLessonItem(db, DEVICE, { lesson_id: lesson.id, kind: 'note' });
  const second = await addLessonItem(db, DEVICE, { lesson_id: lesson.id, kind: 'note' });

  const movedDown = await updateLessonItem(db, DEVICE, first.id, { position: 1 });
  const movedUp = await updateLessonItem(db, DEVICE, second.id, { position: 0 });

  expect(movedDown?.position).toBe(1);
  expect(movedDown?.updated_at).toBeGreaterThan(first.updated_at);
  expect(movedUp?.position).toBe(0);

  const items = await listLessonItems(db, lesson.id);
  expect(items.map((i) => i.id)).toEqual([second.id, first.id]);
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'lesson_items'")).length).toBe(4);
});

test('deleteLessonItem soft-deletes and hides the item from listLessonItems', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const lesson = await createLesson(db, DEVICE, { track_id: track.id, title: 'a' });
  const item = await addLessonItem(db, DEVICE, { lesson_id: lesson.id, kind: 'note' });

  await deleteLessonItem(db, DEVICE, item.id);

  expect((await listLessonItems(db, lesson.id)).length).toBe(0);
  const rows = await db.exec('SELECT deleted_at FROM lesson_items WHERE id = ?', [item.id]);
  expect(rows[0]?.['deleted_at']).not.toBeNull();
});
