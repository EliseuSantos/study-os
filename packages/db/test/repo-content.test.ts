import { expect, test } from 'bun:test';
import { attachContent, deleteContent, getContent, listContentByTopic } from '../src/repo/content';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('attachContent writes the item and exactly one oplog row', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });

  const item = await attachContent(db, DEVICE, {
    topic_id: topic.id,
    source: 'youtube',
    external_id: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Aula 1',
    kind: 'video',
    meta_json: '{"duration":"PT10M"}',
  });
  expect(item.added_at).toBe(item.updated_at);
  expect(item.deleted_at).toBeNull();

  const rows = await db.exec('SELECT * FROM content_items');
  expect(rows.length).toBe(1);
  expect(rows[0]?.['title']).toBe('Aula 1');
  expect(rows[0]?.['source']).toBe('youtube');

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'content_items'");
  expect(ops.length).toBe(1);
  expect(ops[0]?.['row_id']).toBe(item.id);
  expect(ops[0]?.['op']).toBe('upsert');
  expect(ops[0]?.['synced']).toBe(0);
  expect(JSON.parse(ops[0]?.['payload'] as string)).toEqual({ ...item });
});

test('attachContent defaults optional fields to null', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });

  const item = await attachContent(db, DEVICE, {
    topic_id: topic.id,
    source: 'wikipedia',
    title: 'Artigo',
    kind: 'article',
  });
  expect(item.external_id).toBeNull();
  expect(item.url).toBeNull();
  expect(item.meta_json).toBeNull();
  expect(await getContent(db, item.id)).toEqual(item);
});

test('listContentByTopic filters by topic, hides soft-deleted and orders newest first', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const t1 = await createTopic(db, DEVICE, { track_id: track.id, title: 't1' });
  const t2 = await createTopic(db, DEVICE, { track_id: track.id, title: 't2' });

  const base = { source: 'youtube', kind: 'video' };
  const a = await attachContent(db, DEVICE, { ...base, topic_id: t1.id, title: 'a' });
  const b = await attachContent(db, DEVICE, { ...base, topic_id: t1.id, title: 'b' });
  const c = await attachContent(db, DEVICE, { ...base, topic_id: t1.id, title: 'c' });
  await attachContent(db, DEVICE, { ...base, topic_id: t2.id, title: 'elsewhere' });

  // deterministic timestamps: a oldest, c newest
  for (const [id, ts] of [
    [a.id, 1000],
    [b.id, 2000],
    [c.id, 3000],
  ] as const) {
    await db.exec('UPDATE content_items SET added_at = ? WHERE id = ?', [ts, id]);
  }
  await deleteContent(db, DEVICE, b.id);

  expect((await listContentByTopic(db, t1.id)).map((i) => i.id)).toEqual([c.id, a.id]);
});

test('deleteContent soft-deletes, appends a second oplog row and is idempotent', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });
  const item = await attachContent(db, DEVICE, {
    topic_id: topic.id,
    source: 'stackexchange',
    title: 'q',
    kind: 'qa',
  });

  await deleteContent(db, DEVICE, item.id);
  await deleteContent(db, DEVICE, item.id); // already deleted: no-op
  await deleteContent(db, DEVICE, 'missing'); // unknown id: no-op

  const rows = await db.exec('SELECT deleted_at FROM content_items WHERE id = ?', [item.id]);
  expect(rows[0]?.['deleted_at']).not.toBeNull();
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'content_items'")).length).toBe(2);
});
