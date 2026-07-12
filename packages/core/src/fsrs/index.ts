import {
  DAY_MS,
  DECAY,
  DESIRED_RETENTION,
  FACTOR,
  LEARNING_STEP_MS,
  MAX_INTERVAL_DAYS,
  MIN_STABILITY,
  W,
} from './params';

export type Rating = 1 | 2 | 3 | 4;

export type SchedulerCardState = 'new' | 'learning' | 'review' | 'relearning';

export interface SchedulerState {
  state: SchedulerCardState;
  stability: number;
  difficulty: number;
  due_at: number | null;
  last_review: number | null;
  reps: number;
  lapses: number;
}

export function initialSchedulerState(): SchedulerState {
  return {
    state: 'new',
    stability: 0,
    difficulty: 0,
    due_at: null,
    last_review: null,
    reps: 0,
    lapses: 0,
  };
}

function clampDifficulty(d: number): number {
  return Math.min(10, Math.max(1, d));
}

function clampStability(s: number): number {
  return Math.max(MIN_STABILITY, s);
}

function initStability(rating: Rating): number {
  switch (rating) {
    case 1:
      return clampStability(W[0]);
    case 2:
      return clampStability(W[1]);
    case 3:
      return clampStability(W[2]);
    case 4:
      return clampStability(W[3]);
  }
}

function rawInitDifficulty(rating: Rating): number {
  return W[4] - Math.exp(W[5] * (rating - 1)) + 1;
}

function initDifficulty(rating: Rating): number {
  return clampDifficulty(rawInitDifficulty(rating));
}

function nextDifficulty(difficulty: number, rating: Rating): number {
  const delta = -W[6] * (rating - 3);
  const damped = difficulty + (delta * (10 - difficulty)) / 9;
  return clampDifficulty(W[7] * rawInitDifficulty(4) + (1 - W[7]) * damped);
}

function forgettingCurve(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function recallStability(
  difficulty: number,
  stability: number,
  retr: number,
  rating: 2 | 3 | 4,
): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const growth =
    Math.exp(W[8]) *
    (11 - difficulty) *
    Math.pow(stability, -W[9]) *
    (Math.exp(W[10] * (1 - retr)) - 1) *
    hardPenalty *
    easyBonus;
  return clampStability(stability * (1 + growth));
}

function forgetStability(difficulty: number, stability: number, retr: number): number {
  const next =
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - retr));
  return clampStability(Math.min(next, stability));
}

function shortTermStability(stability: number, rating: Rating): number {
  return clampStability(stability * Math.exp(W[17] * (rating - 3 + W[18])));
}

function nextIntervalDays(stability: number, retention: number): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(raw)));
}

interface GradedIntervals {
  hard: number;
  good: number;
  easy: number;
}

function gradedIntervals(
  hardStability: number,
  goodStability: number,
  easyStability: number,
  retention: number,
): GradedIntervals {
  let hard = nextIntervalDays(hardStability, retention);
  let good = nextIntervalDays(goodStability, retention);
  const easyRaw = nextIntervalDays(easyStability, retention);
  hard = Math.min(hard, good);
  good = Math.max(good, hard + 1);
  const easy = Math.max(easyRaw, good + 1);
  return { hard, good, easy };
}

function pickInterval(intervals: GradedIntervals, rating: 2 | 3 | 4): number {
  if (rating === 2) return intervals.hard;
  if (rating === 3) return intervals.good;
  return intervals.easy;
}

function elapsedDaysSince(lastReview: number | null, now: number): number {
  if (lastReview === null) return 0;
  return Math.max(0, (now - lastReview) / DAY_MS);
}

export function schedule(
  s: SchedulerState,
  rating: Rating,
  now: number,
  desiredRetention: number = DESIRED_RETENTION,
): SchedulerState {
  const reps = s.reps + 1;
  switch (s.state) {
    case 'new': {
      const difficulty = initDifficulty(rating);
      const stability = initStability(rating);
      if (rating === 1) {
        return {
          state: 'learning',
          stability,
          difficulty,
          due_at: now + LEARNING_STEP_MS,
          last_review: now,
          reps,
          lapses: s.lapses,
        };
      }
      const intervals = gradedIntervals(
        initStability(2),
        initStability(3),
        initStability(4),
        desiredRetention,
      );
      return {
        state: 'review',
        stability,
        difficulty,
        due_at: now + pickInterval(intervals, rating) * DAY_MS,
        last_review: now,
        reps,
        lapses: s.lapses,
      };
    }
    case 'learning':
    case 'relearning': {
      const difficulty = nextDifficulty(s.difficulty, rating);
      const stability = shortTermStability(s.stability, rating);
      if (rating <= 2) {
        return {
          state: s.state,
          stability,
          difficulty,
          due_at: now + LEARNING_STEP_MS,
          last_review: now,
          reps,
          lapses: s.lapses,
        };
      }
      return {
        state: 'review',
        stability,
        difficulty,
        due_at: now + nextIntervalDays(stability, desiredRetention) * DAY_MS,
        last_review: now,
        reps,
        lapses: s.lapses,
      };
    }
    case 'review': {
      const elapsed = elapsedDaysSince(s.last_review, now);
      const retr = forgettingCurve(elapsed, clampStability(s.stability));
      const difficulty = nextDifficulty(s.difficulty, rating);
      if (rating === 1) {
        return {
          state: 'relearning',
          stability: forgetStability(s.difficulty, s.stability, retr),
          difficulty,
          due_at: now + LEARNING_STEP_MS,
          last_review: now,
          reps,
          lapses: s.lapses + 1,
        };
      }
      const hardStability = recallStability(s.difficulty, s.stability, retr, 2);
      const goodStability = recallStability(s.difficulty, s.stability, retr, 3);
      const easyStability = recallStability(s.difficulty, s.stability, retr, 4);
      const intervals = gradedIntervals(hardStability, goodStability, easyStability, desiredRetention);
      const stability = rating === 2 ? hardStability : rating === 3 ? goodStability : easyStability;
      return {
        state: 'review',
        stability,
        difficulty,
        due_at: now + pickInterval(intervals, rating) * DAY_MS,
        last_review: now,
        reps,
        lapses: s.lapses,
      };
    }
  }
}

export function retrievability(s: SchedulerState, now: number): number {
  if (s.state === 'new' || s.last_review === null || s.stability <= 0) return 1;
  return forgettingCurve(elapsedDaysSince(s.last_review, now), s.stability);
}

/** Interval preview per rating — what `schedule` would produce, for button labels. */
export function previewIntervals(
  s: SchedulerState,
  now: number,
  desiredRetention: number = DESIRED_RETENTION,
): Record<Rating, number> {
  const out = {} as Record<Rating, number>;
  for (const rating of [1, 2, 3, 4] as Rating[]) {
    const next = schedule(s, rating, now, desiredRetention);
    out[rating] = next.due_at === null ? 0 : Math.max(0, next.due_at - now);
  }
  return out;
}

/** Compact pt-BR label for an interval in ms: 10min · 3h · 7d · 2mê. */
export function intervalLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(1, min)}min`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mês`;
}

/**
 * Exam-mode retention ramp: 0.90 until 30 days from the exam, rising linearly
 * to 0.95 on exam day. Past the exam (or with no exam) it stays at 0.90.
 */
export function retentionForDate(examAt: number | null, now: number): number {
  if (examAt === null || examAt <= now) return DESIRED_RETENTION;
  const daysLeft = (examAt - now) / DAY_MS;
  if (daysLeft >= 30) return DESIRED_RETENTION;
  return DESIRED_RETENTION + (0.95 - DESIRED_RETENTION) * (1 - daysLeft / 30);
}
