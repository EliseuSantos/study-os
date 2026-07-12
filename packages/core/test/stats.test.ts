import { describe, expect, test } from 'bun:test';
import {
  accuracyByTrack,
  currentStreak,
  netSecondsPerDay,
  periodComparison,
  weakTopics,
  type ReviewSlice,
  type SessionSlice,
} from '../src/stats';

// Local midnight of 2026-01-<d>; 2026-01-05 is a Monday.
const day = (d: number): number => new Date(2026, 0, d).getTime();
const HOUR_MS = 3_600_000;

const session = (partial: Partial<SessionSlice>): SessionSlice => ({
  started_at: day(5),
  net_seconds: 0,
  track_id: null,
  topic_id: null,
  questions_total: null,
  questions_correct: null,
  ...partial,
});

const review = (partial: Partial<ReviewSlice>): ReviewSlice => ({
  reviewed_at: day(5),
  rating: 3,
  ref_id: 'topic-1',
  ref_kind: 'topic',
  ...partial,
});

describe('netSecondsPerDay', () => {
  test('zero-fills every day in the inclusive range and sums buckets', () => {
    const sessions = [
      session({ started_at: day(5) + HOUR_MS, net_seconds: 600 }),
      session({ started_at: day(5) + 5 * HOUR_MS, net_seconds: 300 }),
      session({ started_at: day(7) + HOUR_MS, net_seconds: 120 }),
      session({ started_at: day(4), net_seconds: 999 }), // before range
      session({ started_at: day(8), net_seconds: 999 }), // after range
    ];
    expect(netSecondsPerDay(sessions, day(5), day(7))).toEqual([
      { day: day(5), seconds: 900 },
      { day: day(6), seconds: 0 },
      { day: day(7), seconds: 120 },
    ]);
  });

  test('single-day range', () => {
    expect(netSecondsPerDay([], day(5), day(5))).toEqual([{ day: day(5), seconds: 0 }]);
  });
});

describe('currentStreak', () => {
  const perDay = (seconds: number[]): { day: number; seconds: number }[] =>
    seconds.map((s, i) => ({ day: day(1 + i), seconds: s }));

  test('counts today when it has study time', () => {
    const now = day(4) + 20 * HOUR_MS;
    expect(currentStreak(perDay([0, 60, 60, 60]), now)).toBe(3);
  });

  test('today at zero falls back to yesterday without breaking', () => {
    const now = day(4) + 20 * HOUR_MS;
    expect(currentStreak(perDay([60, 60, 60, 0]), now)).toBe(3);
  });

  test('a gap breaks the streak; empty input is zero', () => {
    const now = day(4) + 20 * HOUR_MS;
    expect(currentStreak(perDay([60, 0, 60, 60]), now)).toBe(2);
    expect(currentStreak(perDay([0, 0, 0, 0]), now)).toBe(0);
    expect(currentStreak([], now)).toBe(0);
  });
});

describe('accuracyByTrack', () => {
  test('sums question-bearing sessions per track; pct null without questions', () => {
    const sessions = [
      session({ track_id: 'a', questions_total: 10, questions_correct: 7 }),
      session({ track_id: 'a', questions_total: 10, questions_correct: 8 }),
      session({ track_id: 'a', net_seconds: 100 }), // no questions, still counts the track
      session({ track_id: 'b', net_seconds: 100 }),
      session({ track_id: null, questions_total: 4, questions_correct: 1 }),
    ];
    expect(accuracyByTrack(sessions)).toEqual([
      { track_id: 'a', total: 20, correct: 15, pct: 75, measured: false },
      { track_id: 'b', total: 0, correct: 0, pct: null, measured: false },
      { track_id: null, total: 4, correct: 1, pct: 25, measured: false },
    ]);
  });

  test('questions_total of 0 does not count', () => {
    expect(accuracyByTrack([session({ track_id: 'a', questions_total: 0 })])).toEqual([
      { track_id: 'a', total: 0, correct: 0, pct: null, measured: false },
    ]);
  });
});

describe('periodComparison', () => {
  // now = Wednesday 2026-01-07 noon; ISO week starts Monday 2026-01-05 00:00.
  const now = day(7) + 12 * HOUR_MS;

  test('splits at the Monday boundary', () => {
    const sessions = [
      session({ started_at: day(5), net_seconds: 100 }), // exactly Monday 00:00 -> this week
      session({ started_at: day(6) + HOUR_MS, net_seconds: 50 }),
      session({ started_at: day(4) + 23 * HOUR_MS, net_seconds: 40 }), // Sunday -> last week
      session({ started_at: day(2), net_seconds: 60 }), // Friday -> last week
      session({ started_at: day(20), net_seconds: 999 }), // outside both weeks
    ];
    expect(periodComparison(sessions, now)).toEqual({
      thisWeek: 150,
      lastWeek: 100,
      deltaPct: 50,
    });
  });

  test('deltaPct is null when last week is empty', () => {
    const sessions = [session({ started_at: day(6), net_seconds: 30 })];
    expect(periodComparison(sessions, now)).toEqual({ thisWeek: 30, lastWeek: 0, deltaPct: null });
  });
});

describe('weakTopics', () => {
  test('scores low ratings and low net time; filters topics under 3 reviews', () => {
    const reviews = [
      // X: 4 reviews, 3 low, no study time -> 0.7*0.75 + 0.3*1 = 0.825
      review({ ref_id: 'X', rating: 1 }),
      review({ ref_id: 'X', rating: 2 }),
      review({ ref_id: 'X', rating: 1 }),
      review({ ref_id: 'X', rating: 4 }),
      // Y: 3 reviews, 1 low, most-studied -> 0.7*(1/3) + 0.3*0 ~ 0.2333
      review({ ref_id: 'Y', rating: 2 }),
      review({ ref_id: 'Y', rating: 3 }),
      review({ ref_id: 'Y', rating: 4 }),
      // Z: only 2 reviews -> filtered out
      review({ ref_id: 'Z', rating: 1 }),
      review({ ref_id: 'Z', rating: 1 }),
      // card reviews are ignored (no card->topic mapping in the slice)
      review({ ref_id: 'X', rating: 1, ref_kind: 'card' }),
    ];
    const sessions = [session({ topic_id: 'Y', net_seconds: 3600 })];
    const result = weakTopics(reviews, sessions);
    expect(result.map((w) => w.topic_id)).toEqual(['X', 'Y']);
    expect(result[0]?.score).toBeCloseTo(0.825, 5);
    expect(result[1]?.score).toBeCloseTo(0.7 / 3, 5);
  });

  test('respects limit and handles all-zero study time', () => {
    const reviews = ['A', 'B'].flatMap((id) => [
      review({ ref_id: id, rating: 1 }),
      review({ ref_id: id, rating: 1 }),
      review({ ref_id: id, rating: id === 'A' ? 1 : 5 }),
    ]);
    // No sessions: every candidate gets the full time weight (0.3).
    const all = weakTopics(reviews, []);
    expect(all.map((w) => w.topic_id)).toEqual(['A', 'B']);
    expect(all[0]?.score).toBeCloseTo(1, 5);
    expect(all[1]?.score).toBeCloseTo(0.7 * (2 / 3) + 0.3, 5);
    expect(weakTopics(reviews, [], 1).map((w) => w.topic_id)).toEqual(['A']);
  });

  test('empty input yields empty output', () => {
    expect(weakTopics([], [])).toEqual([]);
  });
});

describe('weakTopics with card reviews (M9)', () => {
  test('card reviews aggregate into their resolved topic', () => {
    const now = 1_700_000_000_000;
    const reviews = [1, 1, 2].map((rating, i) => ({
      reviewed_at: now - i * 1000,
      rating,
      ref_id: `card-${i}`,
      ref_kind: 'card',
      topic_id: 'topic-weak',
    }));
    const out = weakTopics(reviews, []);
    expect(out.map((w) => w.topic_id)).toEqual(['topic-weak']);
  });

  test('card review without resolved topic is ignored', () => {
    const now = 1_700_000_000_000;
    const reviews = [1, 1, 1].map((_, i) => ({
      reviewed_at: now,
      rating: 1,
      ref_id: `card-${i}`,
      ref_kind: 'card',
      topic_id: null,
    }));
    expect(weakTopics(reviews, [])).toEqual([]);
  });
});


describe('accuracyByTrack measured precedence (M9)', () => {
  test('quiz sessions replace self-reported numbers for the track', () => {
    const sessions = [
      session({ track_id: 'a', questions_total: 10, questions_correct: 2 }),
      session({ track_id: 'a', questions_total: 5, questions_correct: 4, notes: 'quiz' }),
      session({ track_id: 'a', questions_total: 8, questions_correct: 1 }),
    ];
    expect(accuracyByTrack(sessions)).toEqual([
      { track_id: 'a', total: 5, correct: 4, pct: 80, measured: true },
    ]);
  });
});
