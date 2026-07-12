import { expect, test } from 'bun:test';
import { createCard } from '../src/repo/cards';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { getFsrsState, recordReview, undoLastReview, listQuizCards } from '../src/repo/fsrs';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

async function setup() {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });
  const card = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'Q?' });
  return { db, topic, card };
}

test('undoLastReview restores the prior state and drops the log', async () => {
  const { db, card } = await setup();
  const now = Date.now();
  const first = await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    rating: 3,
    reviewedAt: now - 1000,
    next: {
      state: 'review',
      stability: 3,
      difficulty: 5,
      due_at: now + 3 * 86_400_000,
      last_review: now - 1000,
      reps: 1,
      lapses: 0,
    },
  });
  await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    rating: 1,
    reviewedAt: now,
    next: {
      state: 'relearning',
      stability: 0.5,
      difficulty: 6,
      due_at: now + 600_000,
      last_review: now,
      reps: 2,
      lapses: 1,
    },
  });

  await undoLastReview(db, DEVICE, 'card', card.id, first);

  const state = await getFsrsState(db, 'card', card.id);
  expect(state?.reps).toBe(1);
  expect(state?.lapses).toBe(0);
  expect(state?.due_at).toBe(first.due_at);
  const logs = await db.exec('SELECT * FROM review_logs');
  expect(logs.length).toBe(1);
});

test('undo of the very first review rewrites a pristine state (same id)', async () => {
  const { db, card } = await setup();
  const now = Date.now();
  await recordReview(db, DEVICE, {
    refKind: 'card',
    refId: card.id,
    rating: 3,
    reviewedAt: now,
    next: {
      state: 'learning',
      stability: 1,
      difficulty: 5,
      due_at: now + 600_000,
      last_review: now,
      reps: 1,
      lapses: 0,
    },
  });
  await undoLastReview(db, DEVICE, 'card', card.id, null);
  const pristine = await getFsrsState(db, 'card', card.id);
  expect(pristine?.reps).toBe(0);
  expect(pristine?.due_at).toBeNull();
  expect(pristine?.state).toBe('new');
  expect((await db.exec('SELECT * FROM review_logs')).length).toBe(0);
});

test('listQuizCards returns only quiz kind for the topic', async () => {
  const { db, topic } = await setup();
  await createCard(db, DEVICE, {
    topic_id: topic.id,
    kind: 'quiz',
    front_md: JSON.stringify({ q: 'Q1?', options: ['a', 'b'], answer: 0 }),
  });
  const quiz = await listQuizCards(db, topic.id);
  expect(quiz.length).toBe(1);
  expect(quiz[0]?.kind).toBe('quiz');
});
