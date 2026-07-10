import {
  DAY_MS,
  buildToday,
  parseRrule,
  replan,
  routineOccurrences,
  type PlannerTopic,
  type RoutineSpec,
  type TodayItem,
} from '@studyos/core';
import {
  dueReminders,
  listDueReviews,
  listRoutines,
  listTargets,
  plannerTopics,
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

export interface TodayStore {
  get items(): TodayItem[];
  get replanNote(): boolean;
  get targets(): TargetProgressRow[];
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
  if (browser) {
    void getDb().then((db) => maybeNotifyDue(db));
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
    destroy() {
      feed.destroy();
      targets.destroy();
    },
  };
}
