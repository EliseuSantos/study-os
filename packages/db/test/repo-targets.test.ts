import type { TargetRow } from '@studyos/shared';
import { expect, test } from 'bun:test';
import type { DbDriver } from '../src/driver';
import { createCard } from '../src/repo/cards';
import { recordReview } from '../src/repo/fsrs';
import { createTarget, deleteTarget, listTargets, targetProgress } from '../src/repo/targets';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';
const NOW = Date.now();

function localMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface SessionSeed {
  started_at: number;
  net_seconds?: number;
  track_id?: string | null;
  questions_total?: number | null;
}

// Read-path seeding: crafted timestamps go straight into the table (no oplog).
async function seedSession(db: DbDriver, seed: SessionSeed): Promise<void> {
  await db.exec(
    'INSERT INTO sessions (id, track_id, topic_id, type, started_at, ended_at, net_seconds, ' +
      'focused, questions_total, questions_correct, updated_at) ' +
      'VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, NULL, ?)',
    [
      crypto.randomUUID(),
      seed.track_id ?? null,
      'study',
      seed.started_at,
      seed.started_at + 1000,
      seed.net_seconds ?? 0,
      seed.questions_total ?? null,
      seed.started_at,
    ],
  );
}

function target(overrides: Partial<TargetRow>): TargetRow {
  return {
    id: 'tg1',
    track_id: null,
    metric: 'net_hours',
    period: 'day',
    value: 1,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

test('createTarget writes the target and one oplog row; listTargets hides deleted', async () => {
  const db = await freshDb();
  const keep = await createTarget(db, DEVICE, { metric: 'net_hours', period: 'day', value: 4 });
  const gone = await createTarget(db, DEVICE, { metric: 'sessions', period: 'week', value: 5 });

  await deleteTarget(db, DEVICE, gone.id);

  const visible = await listTargets(db);
  expect(visible.map((t) => t.id)).toEqual([keep.id]);

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'targets'");
  expect(ops.length).toBe(3);
});

test('net_hours: sums net_seconds inside the day window only', async () => {
  const db = await freshDb();
  const midnight = localMidnight(NOW);
  await seedSession(db, { started_at: midnight + 1000, net_seconds: 3600 });
  await seedSession(db, { started_at: midnight - 1000, net_seconds: 7200 }); // yesterday

  const progress = await targetProgress(db, target({ metric: 'net_hours', value: 2 }), NOW);
  expect(progress).toBeCloseTo(0.5);
});

test('progress clamps to 1 when over target', async () => {
  const db = await freshDb();
  await seedSession(db, { started_at: NOW, net_seconds: 3 * 3600 });

  const progress = await targetProgress(db, target({ metric: 'net_hours', value: 1 }), NOW);
  expect(progress).toBe(1);
});

test('questions: sums questions_total, filtered by track when set', async () => {
  const db = await freshDb();
  await seedSession(db, { started_at: NOW, questions_total: 10, track_id: 't1' });
  await seedSession(db, { started_at: NOW, questions_total: 30, track_id: 't2' });

  const all = await targetProgress(db, target({ metric: 'questions', value: 80 }), NOW);
  expect(all).toBeCloseTo(0.5);

  const tracked = await targetProgress(
    db,
    target({ metric: 'questions', value: 20, track_id: 't1' }),
    NOW,
  );
  expect(tracked).toBeCloseTo(0.5);
});

test('sessions: counts sessions in the window', async () => {
  const db = await freshDb();
  await seedSession(db, { started_at: NOW });
  await seedSession(db, { started_at: NOW });

  const progress = await targetProgress(db, target({ metric: 'sessions', value: 4 }), NOW);
  expect(progress).toBeCloseTo(0.5);
});

test('reviews: counts review_logs; track filter resolves topic and card refs', async () => {
  const db = await freshDb();
  const trackA = await createTrack(db, DEVICE, { title: 'A' });
  const trackB = await createTrack(db, DEVICE, { title: 'B' });
  const topicA = await createTopic(db, DEVICE, { track_id: trackA.id, title: 'a1' });
  const topicB = await createTopic(db, DEVICE, { track_id: trackB.id, title: 'b1' });
  const cardA = await createCard(db, DEVICE, { topic_id: topicA.id, front_md: 'q' });

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
    refId: topicA.id,
    next,
    rating: 3,
    reviewedAt: NOW,
  });
  await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: cardA.id,
    next,
    rating: 3,
    reviewedAt: NOW,
  });
  await recordReview(db, DEVICE, {
    refKind: 'topic',
    refId: topicB.id,
    next,
    rating: 3,
    reviewedAt: NOW,
  });

  const all = await targetProgress(
    db,
    target({ metric: 'reviews', value: 6, period: 'week' }),
    NOW,
  );
  expect(all).toBeCloseTo(0.5);

  const trackOnly = await targetProgress(
    db,
    target({ metric: 'reviews', value: 4, period: 'week', track_id: trackA.id }),
    NOW,
  );
  expect(trackOnly).toBeCloseTo(0.5);
});

test('non-positive target value yields 0; unknown metric throws', async () => {
  const db = await freshDb();
  expect(await targetProgress(db, target({ value: 0 }), NOW)).toBe(0);
  await expect(targetProgress(db, target({ metric: 'streaks' }), NOW)).rejects.toThrow(
    'unknown target metric',
  );
});
