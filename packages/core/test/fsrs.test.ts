import { describe, expect, test } from 'bun:test';
import {
  initialSchedulerState,
  retrievability,
  schedule,
  type Rating,
  type SchedulerState,
} from '../src/fsrs';

const DAY = 86_400_000;
const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomReviewState(rand: () => number, now: number): SchedulerState {
  const stability = 0.5 + rand() * 120;
  const elapsedDays = stability * (0.3 + rand() * 1.7);
  return {
    state: 'review',
    stability,
    difficulty: 1 + rand() * 9,
    due_at: now,
    last_review: now - elapsedDays * DAY,
    reps: 1 + Math.floor(rand() * 10),
    lapses: Math.floor(rand() * 3),
  };
}

describe('fsrs canonical chain (new -> good -> good -> again -> good)', () => {
  test('reference values are stable', () => {
    let s = initialSchedulerState();
    let now = T0;

    s = schedule(s, 3, now);
    expect(s.state).toBe('review');
    expect(s.stability).toBeCloseTo(3.173, 4);
    expect(s.difficulty).toBeCloseTo(5.282434, 4);
    expect((s.due_at! - now) / DAY).toBe(3);
    expect(s.reps).toBe(1);
    expect(s.lapses).toBe(0);
    expect(s.last_review).toBe(now);
    now = s.due_at!;

    s = schedule(s, 3, now);
    expect(s.state).toBe('review');
    expect(s.stability).toBeCloseTo(10.738926, 4);
    expect(s.difficulty).toBeCloseTo(5.272968, 4);
    expect((s.due_at! - now) / DAY).toBe(11);
    expect(s.reps).toBe(2);
    expect(s.lapses).toBe(0);
    now = s.due_at!;

    s = schedule(s, 1, now);
    expect(s.state).toBe('relearning');
    expect(s.stability).toBeCloseTo(2.185775, 4);
    expect(s.difficulty).toBeCloseTo(6.790568, 4);
    expect(s.due_at! - now).toBe(10 * MINUTE);
    expect(s.reps).toBe(3);
    expect(s.lapses).toBe(1);
    now = s.due_at!;

    s = schedule(s, 3, now);
    expect(s.state).toBe('review');
    expect(s.stability).toBeCloseTo(3.077071, 4);
    expect(s.difficulty).toBeCloseTo(6.774164, 4);
    expect((s.due_at! - now) / DAY).toBe(3);
    expect(s.reps).toBe(4);
    expect(s.lapses).toBe(1);
  });

  test('stability grows monotonically on repeated good', () => {
    let s = initialSchedulerState();
    let now = T0;
    let previous = 0;
    for (let i = 0; i < 6; i++) {
      s = schedule(s, 3, now);
      expect(s.stability).toBeGreaterThan(previous);
      previous = s.stability;
      now = s.due_at!;
    }
  });

  test('schedule does not mutate its input', () => {
    const s = initialSchedulerState();
    schedule(s, 3, T0);
    expect(s).toEqual(initialSchedulerState());
  });
});

describe('fsrs properties', () => {
  test('easy > good > hard interval across 50 random review states', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const s = randomReviewState(rand, T0);
      const hard = schedule(s, 2, T0).due_at! - T0;
      const good = schedule(s, 3, T0).due_at! - T0;
      const easy = schedule(s, 4, T0).due_at! - T0;
      expect(easy).toBeGreaterThan(good);
      expect(good).toBeGreaterThan(hard);
    }
  });

  test('difficulty stays in [1, 10] and stability stays positive', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      let s = initialSchedulerState();
      let now = T0;
      for (let step = 0; step < 20; step++) {
        const rating = (1 + Math.floor(rand() * 4)) as Rating;
        s = schedule(s, rating, now);
        expect(s.difficulty).toBeGreaterThanOrEqual(1);
        expect(s.difficulty).toBeLessThanOrEqual(10);
        expect(s.stability).toBeGreaterThan(0);
        now = s.due_at!;
      }
    }
  });

  test('lapses increments only on rating 1 from review', () => {
    const rand = mulberry32(99);
    const review = randomReviewState(rand, T0);
    expect(schedule(review, 1, T0).lapses).toBe(review.lapses + 1);
    expect(schedule(review, 2, T0).lapses).toBe(review.lapses);
    expect(schedule(review, 3, T0).lapses).toBe(review.lapses);
    expect(schedule(review, 4, T0).lapses).toBe(review.lapses);
    const fresh = initialSchedulerState();
    expect(schedule(fresh, 1, T0).lapses).toBe(0);
    expect(schedule(fresh, 4, T0).lapses).toBe(0);
  });

  test('reps increments on every review', () => {
    const rand = mulberry32(3);
    let s = initialSchedulerState();
    let now = T0;
    for (let i = 1; i <= 10; i++) {
      s = schedule(s, (1 + Math.floor(rand() * 4)) as Rating, now);
      expect(s.reps).toBe(i);
      expect(s.last_review).toBe(now);
      now = s.due_at!;
    }
  });

  test('retrievability is 1 for new and decreases with elapsed time', () => {
    expect(retrievability(initialSchedulerState(), T0)).toBe(1);
    const s = schedule(initialSchedulerState(), 3, T0);
    expect(retrievability(s, T0)).toBe(1);
    const r1 = retrievability(s, T0 + 1 * DAY);
    const r3 = retrievability(s, T0 + 3 * DAY);
    const r30 = retrievability(s, T0 + 30 * DAY);
    expect(r1).toBeLessThan(1);
    expect(r3).toBeLessThan(r1);
    expect(r30).toBeLessThan(r3);
    expect(r3).toBeCloseTo(0.9047, 3);
    expect(r30).toBeGreaterThan(0);
  });
});
