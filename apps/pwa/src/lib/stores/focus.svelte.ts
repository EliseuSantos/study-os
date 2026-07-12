import { DAY_MS, currentStreak, netSecondsPerDay, periodComparison } from '@studyos/core';
import { listRecentSessions, sessionSlices, type DbDriver } from '@studyos/db';
import type { SessionRow } from '@studyos/shared';
import { liveQuery } from '$lib/db/live.svelte';

export interface FocusSidebar {
  todayMin: number;
  weekMin: number;
  weekSessions: number;
  streakDays: number;
  streakPills: { label: string; hit: boolean; today: boolean }[];
  /** last 7 days, oldest first — fuel for the weekly activity bars */
  weekBars: { label: string; min: number; today: boolean }[];
  recent: SessionRow[];
}

const EMPTY: FocusSidebar = {
  todayMin: 0,
  weekMin: 0,
  weekSessions: 0,
  streakDays: 0,
  streakPills: [],
  weekBars: [],
  recent: [],
};

const WD = ['d', 's', 't', 'q', 'q', 's', 's'];

async function load(db: DbDriver): Promise<FocusSidebar> {
  const now = Date.now();
  const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
  const [slices, recent] = await Promise.all([
    sessionSlices(db, todayMidnight - 30 * DAY_MS),
    listRecentSessions(db, 4),
  ]);
  const perDay = netSecondsPerDay(slices, todayMidnight - 6 * DAY_MS, todayMidnight);
  const today = perDay[perDay.length - 1]?.seconds ?? 0;
  const cmp = periodComparison(slices, now);
  const weekStartDow = new Date(now).getDay();
  const weekStart = todayMidnight - (weekStartDow === 0 ? 6 : weekStartDow - 1) * DAY_MS;
  return {
    todayMin: Math.round(today / 60),
    weekMin: Math.round(cmp.thisWeek / 60),
    weekSessions: slices.filter((s) => s.started_at >= weekStart).length,
    streakDays: currentStreak(perDay, now),
    streakPills: perDay.map((d) => ({
      label: WD[new Date(d.day).getDay()] ?? '',
      hit: d.seconds > 0,
      today: d.day === todayMidnight,
    })),
    weekBars: perDay.map((d) => ({
      label: WD[new Date(d.day).getDay()] ?? '',
      min: Math.round(d.seconds / 60),
      today: d.day === todayMidnight,
    })),
    recent: recent.filter((s) => s.ended_at !== null),
  };
}

export interface FocusStore {
  get data(): FocusSidebar;
  destroy(): void;
}

export function createFocusStore(): FocusStore {
  const live = liveQuery(load, ['sessions'], EMPTY);
  return {
    get data() {
      return live.value;
    },
    destroy() {
      live.destroy();
    },
  };
}
