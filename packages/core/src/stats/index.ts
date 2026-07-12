// M3 stats: pure aggregations over session/review slices. Same timezone
// policy as the planner (see src/planner/index.ts): day boundaries are epoch
// ms of LOCAL midnights passed in by the caller, a day is a fixed 86_400_000
// ms step, DST drift is acceptable in M3. The single sanctioned Date usage is
// `periodComparison`, which needs the local day-of-week / local midnight of
// `now` to find the ISO week start — pure ECMAScript, no platform dep.

import { DAY_MS } from '../planner';

export interface SessionSlice {
  started_at: number;
  net_seconds: number;
  track_id: string | null;
  topic_id: string | null;
  questions_total: number | null;
  questions_correct: number | null;
  /** session type (theory|questions|review|reading); optional for older callers */
  type?: string;
}

export interface ReviewSlice {
  reviewed_at: number;
  rating: number;
  ref_id: string;
  ref_kind: string;
}

/**
 * Net study seconds per day over `[fromDay, toDay]` inclusive (local-midnight
 * epoch ms), zero-filled: every day in the range appears exactly once.
 * Sessions are bucketed by 86_400_000-ms offset from `fromDay`.
 */
export function netSecondsPerDay(
  s: SessionSlice[],
  fromDay: number,
  toDay: number,
): { day: number; seconds: number }[] {
  const out: { day: number; seconds: number }[] = [];
  for (let day = fromDay; day <= toDay; day += DAY_MS) {
    out.push({ day, seconds: 0 });
  }
  for (const session of s) {
    if (session.started_at < fromDay || session.started_at >= toDay + DAY_MS) continue;
    const bucket = Math.floor((session.started_at - fromDay) / DAY_MS);
    const entry = out[bucket];
    if (entry) entry.seconds += session.net_seconds;
  }
  return out;
}

/**
 * Consecutive days with `seconds > 0`, counting back from today (the latest
 * `day` in `perDay` that is `<= now`). If today has 0 seconds the streak is
 * still alive and counting starts from yesterday. Days missing from `perDay`
 * count as 0 and break the streak.
 */
export function currentStreak(perDay: { day: number; seconds: number }[], now: number): number {
  const seconds = new Map<number, number>();
  let today = Number.NEGATIVE_INFINITY;
  for (const entry of perDay) {
    seconds.set(entry.day, entry.seconds);
    if (entry.day <= now && entry.day > today) today = entry.day;
  }
  if (!Number.isFinite(today)) return 0;

  let day = today;
  if ((seconds.get(day) ?? 0) === 0) day -= DAY_MS; // today empty: fall back to yesterday
  let streak = 0;
  while ((seconds.get(day) ?? 0) > 0) {
    streak += 1;
    day -= DAY_MS;
  }
  return streak;
}

/**
 * Question accuracy per track, summed over sessions with `questions_total > 0`.
 * Tracks appear in first-seen order (including `null`); `pct` is 0..100, or
 * null when the track has no question-bearing sessions.
 */
export function accuracyByTrack(
  s: SessionSlice[],
): { track_id: string | null; total: number; correct: number; pct: number | null }[] {
  const rows = new Map<
    string | null,
    { track_id: string | null; total: number; correct: number }
  >();
  for (const session of s) {
    let row = rows.get(session.track_id);
    if (!row) {
      row = { track_id: session.track_id, total: 0, correct: 0 };
      rows.set(session.track_id, row);
    }
    if (session.questions_total !== null && session.questions_total > 0) {
      row.total += session.questions_total;
      row.correct += session.questions_correct ?? 0;
    }
  }
  return [...rows.values()].map((row) => ({
    track_id: row.track_id,
    total: row.total,
    correct: row.correct,
    pct: row.total > 0 ? (row.correct / row.total) * 100 : null,
  }));
}

/**
 * Net seconds this ISO week (Monday 00:00 local) vs the previous one.
 * `deltaPct` is the percentage change from last week, null when last week is 0.
 */
export function periodComparison(
  s: SessionSlice[],
  now: number,
): { thisWeek: number; lastWeek: number; deltaPct: number | null } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0); // local midnight of today
  const daysSinceMonday = (d.getDay() + 6) % 7;
  const thisWeekStart = d.getTime() - daysSinceMonday * DAY_MS;
  const lastWeekStart = thisWeekStart - 7 * DAY_MS;
  const nextWeekStart = thisWeekStart + 7 * DAY_MS;

  let thisWeek = 0;
  let lastWeek = 0;
  for (const session of s) {
    if (session.started_at >= thisWeekStart && session.started_at < nextWeekStart) {
      thisWeek += session.net_seconds;
    } else if (session.started_at >= lastWeekStart && session.started_at < thisWeekStart) {
      lastWeek += session.net_seconds;
    }
  }
  const deltaPct = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null;
  return { thisWeek, lastWeek, deltaPct };
}

export interface WeakTopic {
  topic_id: string;
  score: number;
} // higher = weaker

/**
 * Weakness score per topic: share of ratings 1-2 weighted 0.7, plus normalized
 * inverse net study time weighted 0.3 (least-studied candidate = 1; when no
 * candidate has any time, every time component is 1). Only topics with >= 3
 * reviews qualify; sorted by score desc (topic_id asc tiebreak), top `limit`
 * (default 5).
 *
 * Limitation (M3): only reviews with `ref_kind === 'topic'` are scored —
 * card reviews carry no card→topic mapping in `ReviewSlice`, so they are
 * ignored. Sessions are matched by `topic_id`.
 */
export function weakTopics(
  reviews: ReviewSlice[],
  sessions: SessionSlice[],
  limit = 5,
): WeakTopic[] {
  const ratings = new Map<string, { total: number; low: number }>();
  for (const review of reviews) {
    if (review.ref_kind !== 'topic') continue;
    let entry = ratings.get(review.ref_id);
    if (!entry) {
      entry = { total: 0, low: 0 };
      ratings.set(review.ref_id, entry);
    }
    entry.total += 1;
    if (review.rating <= 2) entry.low += 1;
  }

  const candidates = [...ratings.entries()].filter(([, r]) => r.total >= 3);
  if (candidates.length === 0) return [];

  const netByTopic = new Map<string, number>();
  for (const session of sessions) {
    if (session.topic_id === null) continue;
    netByTopic.set(session.topic_id, (netByTopic.get(session.topic_id) ?? 0) + session.net_seconds);
  }
  const maxNet = Math.max(...candidates.map(([id]) => netByTopic.get(id) ?? 0));

  return candidates
    .map(([topic_id, r]) => {
      const lowShare = r.low / r.total;
      const net = netByTopic.get(topic_id) ?? 0;
      const inverseTime = maxNet > 0 ? 1 - net / maxNet : 1;
      return { topic_id, score: 0.7 * lowShare + 0.3 * inverseTime };
    })
    .toSorted((a, b) => b.score - a.score || a.topic_id.localeCompare(b.topic_id))
    .slice(0, limit);
}
