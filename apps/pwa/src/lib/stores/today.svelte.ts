import {
  DAY_MS,
  buildToday,
  currentStreak,
  netSecondsPerDay,
  parseRrule,
  periodComparison,
  replan,
  routineOccurrences,
  type PlannerTopic,
  type RoutineSpec,
  type TodayItem,
} from '@studyos/core';
import {
  dueReminders,
  listDueReviews,
  listReminders,
  listRoutines,
  listTargets,
  listTracks,
  plannerTopics,
  reviewSlices,
  sessionSlices,
  targetProgress,
  type DbDriver,
} from '@studyos/db';
import type { RoutineRow, TargetRow } from '@studyos/shared';
import { browser } from '$app/environment';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';
import { maybeNotifyDue } from '$lib/push/local';

export interface TargetProgressRow {
  id: string;
  pct: number; // 0..100, for the bar width
  label: string;
}

interface TodayFeed {
  items: TodayItem[];
  replanNote: boolean;
}

function toSpecs(routines: RoutineRow[]): RoutineSpec[] {
  const specs: RoutineSpec[] = [];
  for (const routine of routines) {
    try {
      specs.push({
        id: routine.id,
        track_id: routine.track_id,
        days: parseRrule(routine.rrule),
        start_time: routine.start_time,
        duration_min: routine.duration_min,
      });
    } catch {
      // unsupported rrule: skip the routine rather than break Today
    }
  }
  return specs;
}

/** '130' minutes -> '2h10', '240' -> '4h', '45' -> '45min'. */
function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function targetLabel(target: TargetRow, ratio: number): string {
  if (target.metric === 'net_hours') {
    const doneMin = Math.round(ratio * target.value * 60);
    const totalMin = Math.round(target.value * 60);
    return `meta · ${formatMinutes(doneMin)} / ${formatMinutes(totalMin)}`;
  }
  return `meta · ${Math.round(ratio * target.value)} / ${target.value}`;
}

/**
 * Cheap replan heuristic (no persistence): yesterday had routine occurrences
 * whose tracks still hold unfinished topics, and no session was logged
 * yesterday — so today's plan absorbed the backlog.
 */
async function hadPendingYesterday(
  db: DbDriver,
  specs: RoutineSpec[],
  topics: PlannerTopic[],
  todayMidnight: number,
): Promise<boolean> {
  const yesterday = todayMidnight - DAY_MS;
  const occurring = specs.filter((s) => routineOccurrences(s, yesterday, yesterday).length > 0);
  if (occurring.length === 0) return false;
  const trackIds = new Set(
    occurring.map((s) => s.track_id).filter((id): id is string => id !== null),
  );
  if (trackIds.size === 0) return false;
  const unfinished = topics.some((t) => trackIds.has(t.track_id) && t.status !== 'done');
  if (!unfinished) return false;
  const slices = await sessionSlices(db, yesterday);
  return !slices.some((s) => s.started_at < todayMidnight);
}

async function loadFeed(db: DbDriver): Promise<TodayFeed> {
  const now = Date.now();
  const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
  const [due, routines, topics, reminders] = await Promise.all([
    listDueReviews(db, now),
    listRoutines(db),
    plannerTopics(db),
    dueReminders(db, now),
  ]);
  const specs = toSpecs(routines);
  const blocks = replan(specs, topics, todayMidnight, 7).filter((b) => b.day === todayMidnight);
  const items = buildToday(
    {
      due: due.map((d) => ({ refKind: d.refKind, refId: d.refId, title: d.title, dueAt: d.dueAt })),
      blocks,
      reminders: reminders.map((r) => ({ id: r.id, title: r.title, notify_at: r.notify_at })),
    },
    now,
  );
  return { items, replanNote: await hadPendingYesterday(db, specs, topics, todayMidnight) };
}

async function loadTargets(db: DbDriver): Promise<TargetProgressRow[]> {
  const now = Date.now();
  const targets = await listTargets(db);
  const rows = await Promise.all(
    targets.map(async (target): Promise<TargetProgressRow | null> => {
      try {
        const ratio = await targetProgress(db, target, now);
        return { id: target.id, pct: Math.round(ratio * 100), label: targetLabel(target, ratio) };
      } catch {
        return null; // unknown metric: hide instead of breaking Today
      }
    }),
  );
  return rows.filter((r): r is TargetProgressRow => r !== null);
}

export interface DayCell {
  label: string;
  dayNum: number;
  state: 'done' | 'today' | 'future' | 'empty';
}

export interface TrackProgress {
  id: string;
  title: string;
  done: number;
  total: number;
  pct: number;
}

export interface UpNextRow {
  title: string;
  meta: string;
}

export interface YearCell {
  day: number;
  level: number; // 0..4
}

export interface DashboardData {
  dueCount: number;
  dueEtaMin: number;
  retentionPct: number | null;
  streakDays: number;
  longestStreak: number;
  missedWeek: number; // days without study this week (past days only)
  inactivePct: number; // % of the last 28 days without study
  streakBars: number[]; // last 14 days, minutes (barcode strip)
  weekLabel: string; // '4h20'
  deltaPct: number | null;
  mastered: { done: number; total: number };
  doneThisWeek: number;
  doneLastWeek: number;
  typeMix: { label: string; minutes: number }[];
  dayStrip: DayCell[];
  tracks: TrackProgress[];
  yearHeat: YearCell[]; // jan 1 .. today, column-major weeks
  yearMonths: { label: string; col: number }[];
  activeDays: number;
  bestMonth: string | null;
  ringPct: number; // reviewed today / (reviewed + still due)
  reviewedToday: number;
  upNext: UpNextRow[];
  quote: string;
}

const QUOTES = [
  'a memória consolida dormindo — constância vale mais que intensidade.',
  'blocos curtos todos os dias vencem maratonas de véspera.',
  'atraso não é dívida: o plano se redistribui, você só continua.',
  'revisar no tempo certo é estudar menos, não mais.',
];

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function heatLevel(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds < 30 * 60) return 1;
  if (seconds < 90 * 60) return 2;
  return 3;
}

function mondayOf(dayMidnight: number): number {
  const dow = new Date(dayMidnight).getDay(); // 0=sun
  const back = dow === 0 ? 6 : dow - 1;
  return dayMidnight - back * DAY_MS;
}

const TYPE_LABEL_MIX: Record<string, string> = {
  theory: 'teoria',
  questions: 'questões',
  review: 'revisão',
  reading: 'leitura',
};

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function loadDashboard(db: DbDriver): Promise<DashboardData> {
  const now = Date.now();
  const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
  const weekStart = mondayOf(todayMidnight);
  // rolling 12 months, aligned to the week start so the grid has no ragged head
  const heatStart =
    todayMidnight - 364 * DAY_MS - new Date(todayMidnight - 364 * DAY_MS).getDay() * DAY_MS;
  const from = Math.min(todayMidnight - 84 * DAY_MS, heatStart);

  const [due, sessions, reviews, tracks, topics, routines, reminders] = await Promise.all([
    listDueReviews(db, now),
    sessionSlices(db, from),
    reviewSlices(db, from),
    listTracks(db),
    plannerTopics(db),
    listRoutines(db),
    listReminders(db),
  ]);

  const perDay = netSecondsPerDay(sessions, todayMidnight - 84 * DAY_MS, todayMidnight);
  const streakDays = currentStreak(perDay, now);
  const cmp = periodComparison(sessions, now);
  const weekMin = Math.round(cmp.thisWeek / 60);

  // longest streak over the loaded window
  let longestStreak = 0;
  let run = 0;
  for (const d of perDay) {
    run = d.seconds > 0 ? run + 1 : 0;
    if (run > longestStreak) longestStreak = run;
  }
  const pastWeekDays = perDay.filter((d) => d.day >= weekStart && d.day <= todayMidnight);
  const missedWeek = pastWeekDays.filter((d) => d.seconds === 0).length;
  const last28 = perDay.slice(-28);
  const inactivePct =
    last28.length === 0
      ? 0
      : Math.round((last28.filter((d) => d.seconds === 0).length / last28.length) * 100);
  const streakBars = perDay.slice(-14).map((d) => Math.round(d.seconds / 60));

  // topics completed per ISO week (approximation: done topics by updated_at)
  const doneThisWeek = topics.filter(
    (t) => t.status === 'done',
  ).length; // refined below via updated stamps when available
  const typeTotals = new Map<string, number>();
  for (const session of sessions) {
    if (session.started_at < todayMidnight - 84 * DAY_MS) continue;
    const label = TYPE_LABEL_MIX[session.type ?? ''] ?? 'outros';
    typeTotals.set(label, (typeTotals.get(label) ?? 0) + session.net_seconds);
  }
  const typeMix = ['teoria', 'questões', 'revisão', 'leitura']
    .map((label) => ({ label, minutes: Math.round((typeTotals.get(label) ?? 0) / 60) }))
    .filter((slice) => slice.minutes > 0);

  // timeline: last 12 months .. today
  const yearPerDay = netSecondsPerDay(sessions, heatStart, todayMidnight);
  const yearHeat: YearCell[] = yearPerDay.map((d) => ({ day: d.day, level: heatLevel(d.seconds) + (d.seconds > 90 * 60 ? 1 : 0) }));
  const activeDays = yearPerDay.filter((d) => d.seconds > 0).length;
  const monthActivity = new Map<number, { active: number; total: number }>();
  for (const d of yearPerDay) {
    const m = new Date(d.day).getMonth();
    const acc = monthActivity.get(m) ?? { active: 0, total: 0 };
    acc.total += 1;
    if (d.seconds > 0) acc.active += 1;
    monthActivity.set(m, acc);
  }
  let bestMonth: string | null = null;
  let bestRate = 0;
  for (const [m, acc] of monthActivity) {
    const rate = acc.total === 0 ? 0 : acc.active / acc.total;
    if (acc.active > 0 && rate > bestRate) {
      bestRate = rate;
      bestMonth = `${MONTH_SHORT[m] ?? ''} (${Math.round(rate * 100)}%)`;
    }
  }
  const yearMonths: { label: string; col: number }[] = [];
  let lastMonth = -1;
  yearPerDay.forEach((d, i) => {
    const date = new Date(d.day);
    const m = date.getMonth();
    if (m !== lastMonth) {
      // skip a partial first month so the row doesn't start with a cramped label
      if (lastMonth !== -1 || date.getDate() <= 7) {
        const label =
          m === 0 ? `${MONTH_SHORT[m] ?? ''} ${String(date.getFullYear()).slice(2)}` : (MONTH_SHORT[m] ?? '');
        yearMonths.push({ label, col: Math.floor(i / 7) });
      }
      lastMonth = m;
    }
  });

  const reviewedToday = reviews.filter((r) => r.reviewed_at >= todayMidnight).length;
  const ringBase = reviewedToday + due.length;

  const byTrack = new Map<string, { done: number; total: number }>();
  for (const t of topics) {
    const acc = byTrack.get(t.track_id) ?? { done: 0, total: 0 };
    acc.total += 1;
    if (t.status === 'done') acc.done += 1;
    byTrack.set(t.track_id, acc);
  }
  const trackRows: TrackProgress[] = tracks
    .map((t) => {
      const acc = byTrack.get(t.id) ?? { done: 0, total: 0 };
      return {
        id: t.id,
        title: t.title,
        done: acc.done,
        total: acc.total,
        pct: acc.total === 0 ? 0 : Math.round((acc.done / acc.total) * 100),
      };
    })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const mastered = trackRows.reduce(
    (acc, t) => ({ done: acc.done + t.done, total: acc.total + t.total }),
    { done: 0, total: 0 },
  );

  const weekMs = 7 * DAY_MS;
  const doneStamps = topics.filter((t) => t.status === 'done');
  const thisWeekDone = doneStamps.filter((t) => t.updated_at >= weekStart).length;
  const lastWeekDone = doneStamps.filter(
    (t) => t.updated_at >= weekStart - weekMs && t.updated_at < weekStart,
  ).length;

  const dayStrip: DayCell[] = Array.from({ length: 7 }, (_, i) => {
    const day = weekStart + i * DAY_MS;
    const seconds = perDay.find((d) => d.day === day)?.seconds ?? 0;
    const state: DayCell['state'] =
      day === todayMidnight
        ? 'today'
        : day > todayMidnight
          ? 'future'
          : seconds > 0
            ? 'done'
            : 'empty';
    return {
      label: WEEKDAY_SHORT[new Date(day).getDay()] ?? '',
      dayNum: new Date(day).getDate(),
      state,
    };
  });

  const specs = toSpecs(routines);
  const upNext: UpNextRow[] = [];
  for (const spec of specs) {
    const occ = routineOccurrences(spec, todayMidnight + DAY_MS, todayMidnight + 7 * DAY_MS)[0];
    if (occ === undefined) continue;
    const routine = routines.find((r) => r.id === spec.id);
    if (!routine) continue;
    upNext.push({
      title: routine.title,
      meta: `${WEEKDAY_SHORT[new Date(occ).getDay()] ?? ''} · ${routine.start_time} · ${formatMinutes(routine.duration_min)}`,
    });
    if (upNext.length >= 2) break;
  }
  for (const r of reminders) {
    if (r.notify_at <= now) continue;
    const d = new Date(r.notify_at);
    upNext.push({
      title: r.title,
      meta: `${WEEKDAY_SHORT[d.getDay()] ?? ''} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    });
    if (upNext.length >= 3) break;
  }

  const graded = reviews.length;
  const good = reviews.filter((r) => r.rating >= 3).length;
  const dayOfYear = Math.floor(
    (todayMidnight - new Date(new Date(now).getFullYear(), 0, 1).getTime()) / DAY_MS,
  );

  void doneThisWeek;
  return {
    dueCount: due.length,
    dueEtaMin: Math.max(1, Math.round(due.length * 2)),
    retentionPct: graded === 0 ? null : Math.round((good / graded) * 100),
    streakDays,
    longestStreak,
    missedWeek,
    inactivePct,
    streakBars,
    weekLabel: formatMinutes(weekMin),
    deltaPct: cmp.deltaPct === null ? null : Math.round(cmp.deltaPct),
    mastered,
    doneThisWeek: thisWeekDone,
    doneLastWeek: lastWeekDone,
    typeMix,
    dayStrip,
    tracks: trackRows,
    yearHeat,
    yearMonths,
    activeDays,
    bestMonth,
    ringPct: ringBase === 0 ? 0 : Math.round((reviewedToday / ringBase) * 100),
    reviewedToday,
    upNext,
    quote: QUOTES[dayOfYear % QUOTES.length] ?? QUOTES[0]!,
  };
}

const EMPTY_DASHBOARD: DashboardData = {
  dueCount: 0,
  dueEtaMin: 0,
  retentionPct: null,
  streakDays: 0,
  longestStreak: 0,
  missedWeek: 0,
  inactivePct: 0,
  streakBars: [],
  weekLabel: '0min',
  deltaPct: null,
  mastered: { done: 0, total: 0 },
  doneThisWeek: 0,
  doneLastWeek: 0,
  typeMix: [],
  dayStrip: [],
  tracks: [],
  yearHeat: [],
  yearMonths: [],
  activeDays: 0,
  bestMonth: null,
  ringPct: 0,
  reviewedToday: 0,
  upNext: [],
  quote: QUOTES[0]!,
};

export interface TodayStore {
  get items(): TodayItem[];
  get replanNote(): boolean;
  get targets(): TargetProgressRow[];
  get dashboard(): DashboardData;
  destroy(): void;
}

/** Live Today feed: reviews + plan blocks + reminders merged by core buildToday. */
export function createTodayStore(): TodayStore {
  const feed = liveQuery(
    loadFeed,
    ['fsrs_state', 'cards', 'topics', 'routines', 'reminders', 'sessions'],
    { items: [], replanNote: false } as TodayFeed,
  );
  const targets = liveQuery(loadTargets, ['targets', 'sessions', 'review_logs'], []);
  const dashboard = liveQuery(
    loadDashboard,
    ['sessions', 'review_logs', 'fsrs_state', 'cards', 'topics', 'tracks', 'routines', 'reminders'],
    EMPTY_DASHBOARD,
  );
  if (browser) {
    void getDb()
      .then((db) => maybeNotifyDue(db))
      .catch(() => {});
  }
  return {
    get items() {
      return feed.value.items;
    },
    get replanNote() {
      return feed.value.replanNote;
    },
    get targets() {
      return targets.value;
    },
    get dashboard() {
      return dashboard.value;
    },
    destroy() {
      feed.destroy();
      targets.destroy();
      dashboard.destroy();
    },
  };
}
