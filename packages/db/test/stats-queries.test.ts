import { expect, test } from 'bun:test';
import type { DbDriver } from '../src/driver';
import { createCard } from '../src/repo/cards';
import { recordReview } from '../src/repo/fsrs';
import { plannerTopics, reviewSlices, sessionSlices } from '../src/repo/stats-queries';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';
const NOW = Date.now();

interface SessionSeed {
  started_at: number;
  ended_at?: number | null;
  net_seconds?: number;
  deleted_at?: number | null;
}

async function seedSession(db: DbDriver, seed: SessionSeed): Promise<void> {
  await db.exec(
    'INSERT INTO sessions (id, track_id, topic_id, type, started_at, ended_at, net_seconds, ' +
      'focused, updated_at, deleted_at) VALUES (?, NULL, NULL, ?, ?, ?, ?, 0, ?, ?)',
    [
      crypto.randomUUID(),
      'study',
      seed.started_at,
      seed.ended_at === undefined ? seed.started_at + 1000 : seed.ended_at,
      seed.net_seconds ?? 60,
      seed.started_at,
      seed.deleted_at ?? null,
    ],
  );
}

test('sessionSlices returns ended, non-deleted sessions from fromMs, ordered', async () => {
  const db = await freshDb();
  await seedSession(db, { started_at: NOW - 1000, net_seconds: 120 });
  await seedSession(db, { started_at: NOW - 3000, net_seconds: 60 });
  await seedSession(db, { started_at: NOW - 2000, ended_at: null }); // still running
  await seedSession(db, { started_at: NOW - 1500, deleted_at: NOW }); // deleted
  await seedSession(db, { started_at: NOW - 10_000 }); // before window

  const slices = await sessionSlices(db, NOW - 5000);
  expect(slices.map((s) => s.started_at)).toEqual([NOW - 3000, NOW - 1000]);
  expect(slices[1]?.net_seconds).toBe(120);
  expect(slices[0]?.track_id).toBeNull();
});

test('reviewSlices joins fsrs_state for ref_kind/ref_id and filters by fromMs', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'a' });
  const card = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'q' });

  const next = {
    state: 'review' as const,
    stability: 1,
    difficulty: 5,
    due_at: NOW + 86_400_000,
    last_review: NOW,
    reps: 1,
    lapses: 0,
  };
  await recordReview(db, DEVICE, {
    refKind: 'topic',
    refId: topic.id,
    next,
    rating: 2,
    reviewedAt: NOW - 1000,
  });
  await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    next,
    rating: 4,
    reviewedAt: NOW - 500,
  });
  await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    next,
    rating: 1,
    reviewedAt: NOW - 60_000, // before window
  });

  const slices = await reviewSlices(db, NOW - 2000);
  expect(slices).toEqual([
    { reviewed_at: NOW - 1000, rating: 2, ref_id: topic.id, ref_kind: 'topic' },
    { reviewed_at: NOW - 500, rating: 4, ref_id: card.id, ref_kind: 'card' },
  ]);
});

test('plannerTopics aggregates deps, filters by trackIds, skips deleted topics', async () => {
  const db = await freshDb();
  const trackA = await createTrack(db, DEVICE, { title: 'A' });
  const trackB = await createTrack(db, DEVICE, { title: 'B' });
  const a1 = await createTopic(db, DEVICE, { track_id: trackA.id, title: 'a1' });
  const a2 = await createTopic(db, DEVICE, { track_id: trackA.id, title: 'a2' });
  const a3 = await createTopic(db, DEVICE, { track_id: trackA.id, title: 'a3' });
  const b1 = await createTopic(db, DEVICE, { track_id: trackB.id, title: 'b1' });

  await db.exec('INSERT INTO topic_deps (topic_id, depends_on_id) VALUES (?, ?)', [a3.id, a1.id]);
  await db.exec('INSERT INTO topic_deps (topic_id, depends_on_id) VALUES (?, ?)', [a3.id, a2.id]);
  await db.exec('UPDATE topics SET deleted_at = ? WHERE id = ?', [NOW, b1.id]);

  const all = await plannerTopics(db);
  expect(all.map((t) => t.id)).toEqual([a1.id, a2.id, a3.id]);

  const onlyA = await plannerTopics(db, [trackA.id]);
  expect(onlyA.map((t) => t.title)).toEqual(['a1', 'a2', 'a3']);
  expect(onlyA[0]?.deps).toEqual([]);
  expect(onlyA[2]?.deps?.toSorted()).toEqual([a1.id, a2.id].toSorted());
  expect(onlyA[0]?.status).toBe('pending');
  expect(onlyA[1]?.position).toBe(1);

  expect(await plannerTopics(db, [])).toEqual([]);
  expect((await plannerTopics(db, [trackB.id])).length).toBe(0);
});
