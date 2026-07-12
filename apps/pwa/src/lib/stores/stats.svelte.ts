import {
  DAY_MS,
  accuracyByTrack,
  currentStreak,
  netSecondsPerDay,
  periodComparison,
  weakTopics,
} from '@studyos/core';
import {
  cardOriginStats,
  listTracks,
  plannerTopics,
  reviewSlices,
  sessionSlices,
  type DbDriver,
} from '@studyos/db';
import { liveQuery } from '$lib/db/live.svelte';

export interface HeatCell {
  day: number;
  level: number; // 0 (empty) .. 4
  future: boolean;
}

export interface StatsRow {
  key: string;
  label: string;
  pct: number | null; // 0..100 for the row bar; null hides it
}

export interface TrendPoint {
  day: number;
  minutes: number;
}

export interface MixSlice {
  label: string;
  minutes: number;
}

export interface StatsData {
  heatmap: HeatCell[]; // 84 days, column-major: week columns, dom..sáb rows
  streak: number;
  weekLabel: string;
  lastWeekLabel: string;
  deltaPct: number | null;
  retentionPct: number | null;
  totalMin84: number;
  trend28: TrendPoint[];
  typeMix: MixSlice[];
  accuracy: StatsRow[];
  weak: StatsRow[];
  cardOrigin: { created: number; fromContent: number };
}

const EMPTY: StatsData = {
  heatmap: [],
  streak: 0,
  weekLabel: '0min',
  lastWeekLabel: '0min',
  deltaPct: null,
  retentionPct: null,
  totalMin84: 0,
  trend28: [],
  typeMix: [],
  accuracy: [],
  cardOrigin: { created: 0, fromContent: 0 },
  weak: [],
};

const TYPE_LABEL: Record<string, string> = {
  theory: 'teoria',
  questions: 'questões',
  review: 'revisão',
  reading: 'leitura',
};

/** '130' minutes -> '2h10', '240' -> '4h', '45' -> '45min'. */
function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function formatSeconds(seconds: number): string {
  return formatMinutes(Math.round(seconds / 60));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function buildHeatmap(
  perDay: { day: number; seconds: number }[],
  todayMidnight: number,
): HeatCell[] {
  const nonzero = perDay
    .filter((d) => d.seconds > 0 && d.day <= todayMidnight)
    .map((d) => d.seconds)
    .toSorted((a, b) => a - b);
  const q1 = quantile(nonzero, 0.25);
  const q2 = quantile(nonzero, 0.5);
  const q3 = quantile(nonzero, 0.75);
  return perDay.map((d) => {
    let level = 0;
    if (d.seconds > 0) {
      if (d.seconds <= q1) level = 1;
      else if (d.seconds <= q2) level = 2;
      else if (d.seconds <= q3) level = 3;
      else level = 4;
    }
    return { day: d.day, level, future: d.day > todayMidnight };
  });
}

async function loadStats(db: DbDriver): Promise<StatsData> {
  const now = Date.now();
  const from = now - 84 * DAY_MS;
  const [sessions, reviews, tracks, topics, cardOrigin] = await Promise.all([
    sessionSlices(db, from),
    reviewSlices(db, from),
    listTracks(db),
    plannerTopics(db),
    cardOriginStats(db, now - 28 * DAY_MS),
  ]);

  const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
  const weekStart = todayMidnight - new Date(todayMidnight).getDay() * DAY_MS; // sunday
  const gridStart = weekStart - 11 * 7 * DAY_MS;
  const perDay = netSecondsPerDay(sessions, gridStart, gridStart + 83 * DAY_MS);

  const trackTitles = new Map(tracks.map((t) => [t.id, t.title]));
  const accuracy: StatsRow[] = [];
  for (const row of accuracyByTrack(sessions)) {
    if (row.track_id === null && row.total === 0) continue;
    const title = (row.track_id !== null && trackTitles.get(row.track_id)) || 'sem trilha';
    if (row.pct === null) {
      accuracy.push({ key: row.track_id ?? 'null', label: `${title} · sem questões`, pct: null });
    } else {
      accuracy.push({
        key: row.track_id ?? 'null',
        label: `${title} · ${Math.round(row.pct)}% · ${row.total} ${row.total === 1 ? 'questão' : 'questões'}${row.measured ? ' · medido' : ''}`,
        pct: Math.round(row.pct),
      });
    }
  }

  const topicTitles = new Map(topics.map((t) => [t.id, t.title]));
  const weakRaw = weakTopics(reviews, sessions);
  const maxScore = Math.max(...weakRaw.map((w) => w.score), 0.001);
  const weak: StatsRow[] = [];
  for (const w of weakRaw) {
    const title = topicTitles.get(w.topic_id);
    if (title === undefined) continue; // deleted topic
    weak.push({ key: w.topic_id, label: title, pct: Math.round((w.score / maxScore) * 100) });
  }

  const trendStart = todayMidnight - 27 * DAY_MS;
  const trend28: TrendPoint[] = netSecondsPerDay(sessions, trendStart, todayMidnight).map((d) => ({
    day: d.day,
    minutes: Math.round(d.seconds / 60),
  }));

  const mixTotals = new Map<string, number>();
  for (const session of sessions) {
    const label = TYPE_LABEL[session.type ?? ''] ?? 'outros';
    mixTotals.set(label, (mixTotals.get(label) ?? 0) + session.net_seconds);
  }
  const typeMix: MixSlice[] = ['teoria', 'questões', 'revisão', 'leitura']
    .map((label) => ({ label, minutes: Math.round((mixTotals.get(label) ?? 0) / 60) }))
    .filter((slice) => slice.minutes >= 0);

  const graded = reviews.length;
  const good = reviews.filter((r) => r.rating >= 3).length;
  const cmp = periodComparison(sessions, now);

  return {
    cardOrigin,
    heatmap: buildHeatmap(perDay, todayMidnight),
    streak: currentStreak(perDay, now),
    weekLabel: formatSeconds(cmp.thisWeek),
    lastWeekLabel: formatSeconds(cmp.lastWeek),
    deltaPct: cmp.deltaPct === null ? null : Math.round(cmp.deltaPct),
    retentionPct: graded === 0 ? null : Math.round((good / graded) * 100),
    totalMin84: Math.round(sessions.reduce((n, s) => n + s.net_seconds, 0) / 60),
    trend28,
    typeMix,
    accuracy,
    weak,
  };
}

export interface StatsStore {
  get data(): StatsData;
  destroy(): void;
}

/** Live stats over the last 12 weeks of sessions and reviews. */
export function createStatsStore(): StatsStore {
  const live = liveQuery(
    loadStats,
    ['sessions', 'review_logs', 'fsrs_state', 'tracks', 'topics'],
    EMPTY,
  );
  return {
    get data() {
      return live.value;
    },
    destroy() {
      live.destroy();
    },
  };
}
