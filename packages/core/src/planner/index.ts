// M3 planner: rrule parsing, routine expansion, schedule allocation, weighted
// cycle rotation and the Today feed. Pure functions, no platform deps.
//
// Timezone policy (stated once for the whole module): all day-boundary math
// works on epoch ms of LOCAL midnights passed IN by the caller. A "day" is a
// fixed 86_400_000 ms step; around DST transitions the stepped value drifts
// from the true local midnight by the shifted hour — acceptable in M3.
// `new Date(ms)` is used only as a pure arithmetic helper (local day-of-week
// extraction); core never reads the current clock.

export const DAY_MS = 86_400_000;

export interface RoutineSpec {
  id: string;
  track_id: string | null;
  days: number[]; // 0=Sun..6=Sat
  start_time: string; // 'HH:MM'
  duration_min: number;
}

const BYDAY_TOKENS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const unsupported: () => never = () => {
  throw new Error('unsupported rrule');
};

/**
 * Parses the app-wide RRULE subset: `FREQ=WEEKLY;BYDAY=MO,WE,FR` (day tokens
 * in any order, any non-empty subset; `INTERVAL=1` tolerated). Anything else
 * throws `Error('unsupported rrule')`. Returns sorted unique day numbers
 * (0=Sun..6=Sat).
 */
export function parseRrule(rrule: string): number[] {
  const parts = rrule
    .trim()
    .split(';')
    .filter((p) => p.length > 0);
  if (parts.length === 0) unsupported();

  let freq: string | null = null;
  let byday: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) unsupported();
    const key = part.slice(0, eq).toUpperCase();
    const value = part.slice(eq + 1);
    if (key === 'FREQ') {
      if (freq !== null || value.toUpperCase() !== 'WEEKLY') unsupported();
      freq = value;
    } else if (key === 'BYDAY') {
      if (byday !== null) unsupported();
      byday = value;
    } else if (key === 'INTERVAL') {
      if (value !== '1') unsupported();
    } else {
      unsupported();
    }
  }
  if (freq === null || byday === null || byday.length === 0) unsupported();

  const days = new Set<number>();
  for (const token of byday.split(',')) {
    const day = BYDAY_TOKENS[token.trim().toUpperCase()];
    if (day === undefined) unsupported();
    days.add(day);
  }
  return [...days].toSorted((a, b) => a - b);
}

/** Local day-of-week (0=Sun..6=Sat) of an epoch-ms local midnight. */
function dayOfWeek(dayMs: number): number {
  return new Date(dayMs).getDay();
}

/**
 * Days (epoch ms local midnights) in `[fromDay, toDay]` inclusive on which the
 * routine occurs.
 */
export function routineOccurrences(r: RoutineSpec, fromDay: number, toDay: number): number[] {
  const wanted = new Set(r.days);
  const out: number[] = [];
  for (let day = fromDay; day <= toDay; day += DAY_MS) {
    if (wanted.has(dayOfWeek(day))) out.push(day);
  }
  return out;
}

export interface PlannerTopic {
  id: string;
  track_id: string;
  title: string;
  status: 'pending' | 'studying' | 'done';
  position: number;
  deps: string[];
}

export interface PlanBlock {
  day: number;
  routine_id: string;
  track_id: string | null;
  topic_id: string | null;
  title: string;
  duration_min: number;
}

const FREE_STUDY_TITLE = 'estudo livre';

const byPosition = (a: PlannerTopic, b: PlannerTopic): number =>
  a.position - b.position || a.id.localeCompare(b.id);

/**
 * Topological order of a track's unfinished topics: dependencies first,
 * position as the tiebreak (Kahn's algorithm with a min-position frontier).
 * Deps pointing at done or unknown topics count as satisfied. If a dependency
 * cycle remains, the lowest-position topic in the cycle is emitted next so the
 * order stays total and deterministic.
 */
function orderTopics(topics: PlannerTopic[]): PlannerTopic[] {
  const unfinished = topics.filter((t) => t.status !== 'done');
  const ids = new Set(unfinished.map((t) => t.id));
  const remainingDeps = new Map<string, Set<string>>();
  for (const t of unfinished) {
    remainingDeps.set(t.id, new Set(t.deps.filter((d) => ids.has(d) && d !== t.id)));
  }

  const pending = unfinished.toSorted(byPosition);
  const done = new Set<string>();
  const out: PlannerTopic[] = [];
  while (out.length < unfinished.length) {
    let pick: PlannerTopic | undefined;
    for (const t of pending) {
      if (done.has(t.id)) continue;
      const deps = remainingDeps.get(t.id);
      if (!deps || [...deps].every((d) => done.has(d))) {
        pick = t;
        break;
      }
    }
    // Cycle: fall back to the lowest-position remaining topic.
    if (!pick) pick = pending.find((t) => !done.has(t.id));
    if (!pick) break; // unreachable, satisfies noUncheckedIndexedAccess-style narrowing
    done.add(pick.id);
    out.push(pick);
  }
  return out;
}

/**
 * Schedule mode: fills each routine occurrence in `[fromDay, toDay]` with the
 * next unfinished topic of that routine's track in topological order (deps
 * first, then position). All routines of the same track share one cursor per
 * call, so a topic is not repeated until every unfinished topic of the track
 * has been consumed — then allocation cycles from the start. Routines without
 * a track (and tracks whose topics are all done) produce `topic_id: null`
 * blocks titled 'estudo livre'.
 *
 * Blocks are emitted day by day; within a day, in routine start_time order
 * (routine id as tiebreak) — consumers rely on array order as the daily order.
 */
export function allocateSchedule(
  routines: RoutineSpec[],
  topics: PlannerTopic[],
  fromDay: number,
  toDay: number,
): PlanBlock[] {
  const orderedByTrack = new Map<string, PlannerTopic[]>();
  for (const t of topics) {
    const list = orderedByTrack.get(t.track_id);
    if (list) list.push(t);
    else orderedByTrack.set(t.track_id, [t]);
  }
  for (const [trackId, list] of orderedByTrack) {
    orderedByTrack.set(trackId, orderTopics(list));
  }

  const cursors = new Map<string, number>();
  const sortedRoutines = routines.toSorted(
    (a, b) => a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id),
  );

  const out: PlanBlock[] = [];
  for (let day = fromDay; day <= toDay; day += DAY_MS) {
    const dow = dayOfWeek(day);
    for (const r of sortedRoutines) {
      if (!r.days.includes(dow)) continue;
      let topic: PlannerTopic | undefined;
      if (r.track_id !== null) {
        const ordered = orderedByTrack.get(r.track_id) ?? [];
        if (ordered.length > 0) {
          const cursor = cursors.get(r.track_id) ?? 0;
          topic = ordered[cursor % ordered.length];
          cursors.set(r.track_id, cursor + 1);
        }
      }
      out.push({
        day,
        routine_id: r.id,
        track_id: r.track_id,
        topic_id: topic ? topic.id : null,
        title: topic ? topic.title : FREE_STUDY_TITLE,
        duration_min: r.duration_min,
      });
    }
  }
  return out;
}

export interface CycleSlotSpec {
  id: string;
  topic_id: string;
  title: string;
  weight: number;
  position: number;
}

/**
 * Weighted round-robin: each slot takes `weight` consecutive turns per cycle,
 * slots expand in position order (id tiebreak) — weights A=2, B=1 yield
 * A A B A A B… The pointer is the total number of picks already made
 * (persisted by the caller) and wraps around the expanded cycle. Slots with
 * weight < 1 are skipped; returns null when nothing is pickable.
 */
export function cycleNext(
  slots: CycleSlotSpec[],
  pointer: number,
): { slot: CycleSlotSpec; nextPointer: number } | null {
  const usable = slots
    .filter((s) => Math.floor(s.weight) >= 1)
    .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  if (usable.length === 0) return null;

  const expanded: CycleSlotSpec[] = [];
  for (const slot of usable) {
    for (let i = 0; i < Math.floor(slot.weight); i++) expanded.push(slot);
  }
  const index = ((pointer % expanded.length) + expanded.length) % expanded.length;
  const slot = expanded[index];
  if (!slot) return null; // unreachable; index is in range
  return { slot, nextPointer: pointer + 1 };
}

/**
 * Replan: overdue plan-days are redistributed strictly forward. M3 keeps plan
 * blocks derived (not persisted), so replanning is exactly `allocateSchedule`
 * starting from today — this function makes that policy explicit and testable.
 *
 * `todayDay` is epoch ms of TODAY'S LOCAL MIDNIGHT (normalized by the caller;
 * core cannot derive a local midnight from a raw timestamp). The horizon
 * covers `todayDay` through `todayDay + (horizonDays - 1)` days, so no past
 * day is ever emitted; being pure, it is idempotent by construction.
 */
export function replan(
  routines: RoutineSpec[],
  topics: PlannerTopic[],
  todayDay: number,
  horizonDays: number,
): PlanBlock[] {
  if (horizonDays < 1) return [];
  return allocateSchedule(routines, topics, todayDay, todayDay + (horizonDays - 1) * DAY_MS);
}

export interface TodayInputs {
  due: { refKind: 'card' | 'topic'; refId: string; title: string; dueAt: number | null }[];
  blocks: PlanBlock[];
  reminders: { id: string; title: string; notify_at: number }[];
}

export interface TodayItem {
  kind: 'review' | 'block' | 'reminder';
  title: string;
  subtitle: string | null;
  href: string;
  sort: number;
}

/** '90 min' -> '1h30 de estudo', '120' -> '2h de estudo', '45' -> '45min de estudo'. */
function blockSubtitle(durationMin: number): string {
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m}min de estudo`;
  if (m === 0) return `${h}h de estudo`;
  return `${h}h${String(m).padStart(2, '0')} de estudo`;
}

/**
 * Merges today's inputs into one ordered feed. Sort bands:
 * - 0..    overdue reviews (`dueAt < now`), oldest due first
 * - 100..  due reminders (`notify_at <= now`), earliest first; reminders not
 *          yet due are omitted (they are not part of Today)
 * - 200..  plan blocks, in input array order (allocateSchedule emits them in
 *          per-day chronological order)
 * - 300..  fresh reviews (`dueAt` null or `>= now`), earliest first, undated last
 */
export function buildToday(inputs: TodayInputs, now: number): TodayItem[] {
  const items: TodayItem[] = [];

  const overdue = inputs.due
    .filter((d) => d.dueAt !== null && d.dueAt < now)
    .toSorted((a, b) => (a.dueAt as number) - (b.dueAt as number));
  overdue.forEach((d, i) => {
    items.push({ kind: 'review', title: d.title, subtitle: 'revisão', href: '/review', sort: i });
  });

  const dueReminders = inputs.reminders
    .filter((r) => r.notify_at <= now)
    .toSorted((a, b) => a.notify_at - b.notify_at);
  dueReminders.forEach((r, i) => {
    items.push({
      kind: 'reminder',
      title: r.title,
      subtitle: 'lembrete',
      href: '/routines',
      sort: 100 + i,
    });
  });

  inputs.blocks.forEach((b, i) => {
    items.push({
      kind: 'block',
      title: b.title,
      subtitle: blockSubtitle(b.duration_min),
      href: '/study',
      sort: 200 + i,
    });
  });

  const fresh = inputs.due
    .filter((d) => d.dueAt === null || d.dueAt >= now)
    .toSorted((a, b) => {
      if (a.dueAt === null && b.dueAt === null) return 0;
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return a.dueAt - b.dueAt;
    });
  fresh.forEach((d, i) => {
    items.push({
      kind: 'review',
      title: d.title,
      subtitle: 'revisão',
      href: '/review',
      sort: 300 + i,
    });
  });

  return items.toSorted((a, b) => a.sort - b.sort);
}
