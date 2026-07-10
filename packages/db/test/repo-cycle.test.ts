import { expect, test } from 'bun:test';
import { getCyclePointer, listCycleSlots, setCycleSlots, setCyclePointer } from '../src/repo/cycle';
import { setSetting } from '../src/repo/settings';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import type { DbDriver } from '../src/driver';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

async function seedTrack(db: DbDriver): Promise<{ trackId: string; topicIds: string[] }> {
  const track = await createTrack(db, DEVICE, { title: 'ciclo', mode: 'cycle' });
  const topicIds: string[] = [];
  for (const title of ['a', 'b', 'c']) {
    const topic = await createTopic(db, DEVICE, { track_id: track.id, title });
    topicIds.push(topic.id);
  }
  return { trackId: track.id, topicIds };
}

test('setCycleSlots inserts slots with position = index and weight clamped >= 1', async () => {
  const db = await freshDb();
  const { trackId, topicIds } = await seedTrack(db);

  await setCycleSlots(db, DEVICE, trackId, [
    { topic_id: topicIds[0] ?? '', weight: 0 },
    { topic_id: topicIds[1] ?? '', weight: 2.7 },
    { topic_id: topicIds[2] ?? '', weight: 3 },
  ]);

  const slots = await listCycleSlots(db, trackId);
  expect(slots.map((s) => s.topic_id)).toEqual(topicIds);
  expect(slots.map((s) => s.position)).toEqual([0, 1, 2]);
  expect(slots.map((s) => s.weight)).toEqual([1, 2, 3]);

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'cycle_slots'");
  expect(ops.length).toBe(3);
});

test('setCycleSlots replaces the previous list atomically (old slots soft-deleted)', async () => {
  const db = await freshDb();
  const { trackId, topicIds } = await seedTrack(db);

  await setCycleSlots(db, DEVICE, trackId, [
    { topic_id: topicIds[0] ?? '', weight: 1 },
    { topic_id: topicIds[1] ?? '', weight: 1 },
  ]);
  await setCycleSlots(db, DEVICE, trackId, [{ topic_id: topicIds[2] ?? '', weight: 5 }]);

  const slots = await listCycleSlots(db, trackId);
  expect(slots.map((s) => s.topic_id)).toEqual([topicIds[2] ?? '']);
  expect(slots[0]?.position).toBe(0);

  const all = await db.exec('SELECT * FROM cycle_slots WHERE track_id = ?', [trackId]);
  expect(all.length).toBe(3);
  expect(all.filter((r) => r['deleted_at'] !== null).length).toBe(2);

  // first set: 2 ops; second set: 2 soft-deletes + 1 insert
  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'cycle_slots'");
  expect(ops.length).toBe(5);
});

test('setCycleSlots with an empty list clears the cycle', async () => {
  const db = await freshDb();
  const { trackId, topicIds } = await seedTrack(db);

  await setCycleSlots(db, DEVICE, trackId, [{ topic_id: topicIds[0] ?? '', weight: 1 }]);
  await setCycleSlots(db, DEVICE, trackId, []);

  expect(await listCycleSlots(db, trackId)).toEqual([]);
});

test('cycle pointer defaults to 0, round-trips, and ignores garbage', async () => {
  const db = await freshDb();

  expect(await getCyclePointer(db, 'track-1')).toBe(0);

  await setCyclePointer(db, 'track-1', 7);
  expect(await getCyclePointer(db, 'track-1')).toBe(7);
  expect(await getCyclePointer(db, 'track-2')).toBe(0);

  await setSetting(db, 'cycle_pointer:track-1', 'abc');
  expect(await getCyclePointer(db, 'track-1')).toBe(0);

  // local-only: pointer writes never hit the oplog
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'settings'")).length).toBe(0);
});
