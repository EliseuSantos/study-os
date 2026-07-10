import { expect, test } from 'bun:test';
import { createTrack, deleteTrack, getTrack, listTracks, updateTrack } from '../src/repo/tracks';
import {
  createTopic,
  createTopicTree,
  deleteTopic,
  listTopics,
  setTopicStatus,
  type OutlineNodeInput,
} from '../src/repo/topics';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('createTrack writes the track and exactly one oplog row', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 'ENEM 2026' });

  expect(track.mode).toBe('schedule');
  expect(await getTrack(db, track.id)).toEqual(track);

  const ops = await db.exec('SELECT * FROM oplog');
  expect(ops.length).toBe(1);
  expect(ops[0]?.['tbl']).toBe('tracks');
  expect(ops[0]?.['row_id']).toBe(track.id);
});

test('listTracks hides soft-deleted tracks; deleteTrack appends an oplog row', async () => {
  const db = await freshDb();
  const keep = await createTrack(db, DEVICE, { title: 'keep' });
  const gone = await createTrack(db, DEVICE, { title: 'gone' });

  await deleteTrack(db, DEVICE, gone.id);

  const visible = await listTracks(db);
  expect(visible.map((t) => t.id)).toEqual([keep.id]);

  const row = await db.exec('SELECT deleted_at FROM tracks WHERE id = ?', [gone.id]);
  expect(row[0]?.['deleted_at']).not.toBeNull();
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(3);
});

test('updateTrack patches fields, bumps updated_at and appends an oplog row', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 'antes' });

  const updated = await updateTrack(db, DEVICE, track.id, { title: 'depois', mode: 'cycle' });
  expect(updated?.title).toBe('depois');
  expect(updated?.mode).toBe('cycle');
  expect(updated?.updated_at).toBeGreaterThan(track.updated_at);

  const rows = await db.exec('SELECT title, mode FROM tracks WHERE id = ?', [track.id]);
  expect(rows[0]?.['title']).toBe('depois');
  expect(rows[0]?.['mode']).toBe('cycle');
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'tracks'")).length).toBe(2);
});

test('updateTrack returns null for missing or deleted tracks', async () => {
  const db = await freshDb();
  expect(await updateTrack(db, DEVICE, 'nope', { title: 'x' })).toBeNull();

  const track = await createTrack(db, DEVICE, { title: 'gone' });
  await deleteTrack(db, DEVICE, track.id);
  expect(await updateTrack(db, DEVICE, track.id, { title: 'x' })).toBeNull();
});

test('createTopic defaults position to the next sibling index', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const a = await createTopic(db, DEVICE, { track_id: track.id, title: 'a' });
  const b = await createTopic(db, DEVICE, { track_id: track.id, title: 'b' });
  const child = await createTopic(db, DEVICE, {
    track_id: track.id,
    parent_id: a.id,
    title: 'a1',
  });

  expect(a.position).toBe(0);
  expect(b.position).toBe(1);
  expect(child.position).toBe(0);
});

test('createTopicTree imports a 3-level forest atomically', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const opsBefore = (await db.exec('SELECT * FROM oplog')).length;

  const forest: OutlineNodeInput[] = [
    {
      title: 'A',
      children: [
        { title: 'A1', children: [{ title: 'A1a', children: [] }] },
        { title: 'A2', children: [] },
      ],
    },
    { title: 'B', children: [] },
  ];
  const count = await createTopicTree(db, DEVICE, track.id, forest);
  expect(count).toBe(5);

  const topics = await listTopics(db, track.id);
  expect(topics.length).toBe(5);

  const byTitle = new Map(topics.map((t) => [t.title, t]));
  const a = byTitle.get('A');
  const a1 = byTitle.get('A1');
  const a1a = byTitle.get('A1a');
  const a2 = byTitle.get('A2');
  const b = byTitle.get('B');

  expect(a?.parent_id).toBeNull();
  expect(b?.parent_id).toBeNull();
  expect(a1?.parent_id).toBe(a?.id ?? '');
  expect(a2?.parent_id).toBe(a?.id ?? '');
  expect(a1a?.parent_id).toBe(a1?.id ?? '');

  expect([a?.position, b?.position]).toEqual([0, 1]);
  expect([a1?.position, a2?.position]).toEqual([0, 1]);
  expect(a1a?.position).toBe(0);

  const topicOps = await db.exec("SELECT * FROM oplog WHERE tbl = 'topics'");
  expect(topicOps.length).toBe(5);
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(opsBefore + 5);
});

test('setTopicStatus updates status with a bumped updated_at', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });

  await setTopicStatus(db, DEVICE, topic.id, 'studying');

  const rows = await db.exec('SELECT status, updated_at FROM topics WHERE id = ?', [topic.id]);
  expect(rows[0]?.['status']).toBe('studying');
  expect(rows[0]?.['updated_at'] as number).toBeGreaterThan(topic.updated_at);
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'topics'")).length).toBe(2);
});

test('deleteTopic soft-deletes and hides the topic from listTopics', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });

  await deleteTopic(db, DEVICE, topic.id);

  expect((await listTopics(db, track.id)).length).toBe(0);
  const rows = await db.exec('SELECT deleted_at FROM topics WHERE id = ?', [topic.id]);
  expect(rows[0]?.['deleted_at']).not.toBeNull();
});
