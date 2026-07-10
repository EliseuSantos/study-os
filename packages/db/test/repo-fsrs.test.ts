import { expect, test } from 'bun:test';
import { createCard, deleteCard } from '../src/repo/cards';
import {
  getFsrsState,
  listDueReviews,
  recordReview,
  type SchedulerStateShape,
} from '../src/repo/fsrs';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';
import type { DbDriver } from '../src/driver';

const DEVICE = 'device-test';

function next(overrides: Partial<SchedulerStateShape> = {}): SchedulerStateShape {
  return {
    state: 'learning',
    stability: 1.5,
    difficulty: 5,
    due_at: Date.now() + 60_000,
    last_review: Date.now(),
    reps: 1,
    lapses: 0,
    ...overrides,
  };
}

async function seedCard(db: DbDriver, front = 'Q?') {
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });
  const card = await createCard(db, DEVICE, { topic_id: topic.id, front_md: front });
  return { track, topic, card };
}

test('recordReview creates the state row, then updates it in place', async () => {
  const db = await freshDb();
  const { card } = await seedCard(db);

  const first = await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    next: next(),
    rating: 3,
    reviewedAt: Date.now(),
    elapsedMs: 1200,
  });
  expect(first.state).toBe('learning');
  expect(first.reps).toBe(1);
  expect(await getFsrsState(db, 'card', card.id)).toEqual(first);

  const second = await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    next: next({ state: 'review', stability: 4, reps: 2 }),
    rating: 4,
    reviewedAt: Date.now(),
  });
  expect(second.id).toBe(first.id);
  expect(second.reps).toBe(2);
  expect(second.updated_at).toBeGreaterThan(first.updated_at);

  const states = await db.exec('SELECT * FROM fsrs_state');
  expect(states.length).toBe(1);
  const logs = await db.exec('SELECT * FROM review_logs ORDER BY reviewed_at');
  expect(logs.length).toBe(2);
  expect(logs[0]?.['fsrs_id']).toBe(first.id);
  expect(logs[0]?.['rating']).toBe(3);
  expect(logs[0]?.['elapsed_ms']).toBe(1200);
  expect(logs[1]?.['rating']).toBe(4);
  expect(logs[1]?.['elapsed_ms']).toBeNull();
});

test('recordReview writes fsrs_state and review_logs in one batch: failure rolls back both', async () => {
  const db = await freshDb();
  const { card } = await seedCard(db);

  // null reviewedAt violates review_logs NOT NULL after the fsrs upsert succeeded
  await expect(
    recordReview(db, DEVICE, {
      refKind: 'card',
      refId: card.id,
      next: next(),
      rating: 3,
      reviewedAt: null as unknown as number,
    }),
  ).rejects.toThrow();

  expect((await db.exec('SELECT * FROM fsrs_state')).length).toBe(0);
  expect((await db.exec('SELECT * FROM review_logs')).length).toBe(0);
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'fsrs_state'")).length).toBe(0);
});

test('recordReview appends exactly one oplog row (fsrs_state), none for review_logs', async () => {
  const db = await freshDb();
  const { card } = await seedCard(db);
  const opsBefore = (await db.exec('SELECT * FROM oplog')).length;

  await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    next: next(),
    rating: 3,
    reviewedAt: Date.now(),
  });

  const ops = await db.exec('SELECT tbl FROM oplog');
  expect(ops.length).toBe(opsBefore + 1);
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'fsrs_state'")).length).toBe(1);
  expect(ops.every((o) => o['tbl'] !== 'review_logs')).toBe(true);
});

test('listDueReviews: past dues ordered first, new cards after, future/deleted excluded', async () => {
  const db = await freshDb();
  const nowTs = Date.now();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'Kinematics' });

  const overdue = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'overdue' });
  const later = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'later' });
  const future = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'future' });
  const fresh = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'fresh' });
  const deleted = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'deleted' });
  const deletedNew = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'del-new' });

  const review = (refId: string, dueAt: number, refKind: 'card' | 'topic' = 'card') =>
    recordReview(db, DEVICE, {
      refKind,
      refId,
      next: next({ due_at: dueAt }),
      rating: 3,
      reviewedAt: nowTs,
    });

  await review(later.id, nowTs - 1_000);
  await review(overdue.id, nowTs - 60_000);
  await review(future.id, nowTs + 60_000);
  await review(deleted.id, nowTs - 30_000);
  await review(topic.id, nowTs - 5_000, 'topic');
  await deleteCard(db, DEVICE, deleted.id);
  await deleteCard(db, DEVICE, deletedNew.id);

  const queue = await listDueReviews(db, nowTs);
  expect(queue.map((q) => q.refId)).toEqual([overdue.id, topic.id, later.id, fresh.id]);

  const dueItems = queue.slice(0, 3);
  for (const item of dueItems) {
    expect(item.fsrs).not.toBeNull();
    expect(item.dueAt).not.toBeNull();
  }
  expect(queue[1]?.refKind).toBe('topic');
  expect(queue[1]?.title).toBe('Kinematics');
  expect(queue[2]?.title).toBe('later');

  const newItem = queue[3];
  expect(newItem?.refKind).toBe('card');
  expect(newItem?.title).toBe('fresh');
  expect(newItem?.dueAt).toBeNull();
  expect(newItem?.fsrs).toBeNull();

  expect((await listDueReviews(db, nowTs, 2)).map((q) => q.refId)).toEqual([overdue.id, topic.id]);
});
