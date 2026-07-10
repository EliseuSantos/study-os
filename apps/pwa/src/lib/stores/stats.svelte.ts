import {
  DAY_MS,
  accuracyByTrack,
  currentStreak,
  netSecondsPerDay,
  periodComparison,
  weakTopics,
} from '@studyos/core';
import { listTracks, plannerTopics, reviewSlices, sessionSlices, type DbDriver } from '@studyos/db';
import { liveQuery } from '$lib/db/live.svelte';

export interface HeatCell {
  day: number;
  level: number; // 0 (empty) .. 4
  future: boolean;
}

export interface StatsRow {
  key: string;
  label: string;
}

export interface StatsData {
  heatmap: HeatCell[]; // 84 days, column-major: week columns, dom..sáb rows
  streak: number;
  comparison: string;
  accuracy: StatsRow[];
  weak: StatsRow[];
}

const EMPTY: StatsData = { heatmap: [], streak: 0, comparison: '', accuracy: [], weak: [] };

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

function comparisonLabel(cmp: { thisWeek: number; lastWeek: number; deltaPct: number | null }) {
  const base = `esta semana ${formatSeconds(cmp.thisWeek)} · semana passada ${formatSeconds(cmp.lastWeek)}`;
  if (cmp.deltaPct === null) return base;
  const rounded = Math.round(cmp.deltaPct);
  return `${base} · ${rounded >= 0 ? '+' : ''}${rounded}%`;
}

async function loadStats(db: DbDriver): Promise<StatsData> {
  const now = Date.now();
  const from = now - 84 * DAY_MS;
  const [sessions, reviews, tracks, topics] = await Promise.all([
    sessionSlices(db, from),
    reviewSlices(db, from),
    listTracks(db),
    plannerTopics(db),
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
      accuracy.push({ key: row.track_id ?? 'null', label: `${title} · sem questões` });
    } else {
      accuracy.push({
        key: row.track_id ?? 'null',
        label: `${title} · ${Math.round(row.pct)}% · ${row.total} ${row.total === 1 ? 'questão' : 'questões'}`,
      });
    }
  }

  const topicTitles = new Map(topics.map((t) => [t.id, t.title]));
  const weak: StatsRow[] = [];
  for (const w of weakTopics(reviews, sessions)) {
    const title = topicTitles.get(w.topic_id);
    if (title === undefined) continue; // deleted topic
    weak.push({ key: w.topic_id, label: `${title} · atenção` });
  }

  return {
    heatmap: buildHeatmap(perDay, todayMidnight),
    streak: currentStreak(perDay, now),
    comparison: comparisonLabel(periodComparison(sessions, now)),
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
