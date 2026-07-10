# M3 contracts (frozen for parallel workstreams)

Planner & routine: routines (weekly), planner (schedule + cycle + replan), targets with
progress on Today, stats screen, reminders with local notifications, web push (payload-less)

- `.ics` fallback. Done when a week of routine auto-populates Today and falling behind
  replans forward — never a visible backlog.

## RRULE subset (whole app)

Only weekly recurrence: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU` (any subset of days).
`routines.start_time` is `'HH:MM'`, `duration_min` minutes. Parsing/expansion lives in core.

## packages/core (stream A)

### planner (M2's `QueueItem`/`dailyQueue` and the `planDay`/stats stubs were removed — verified unconsumed outside core; planner is consumed only via these contracts after M3)

```ts
export interface RoutineSpec {
  id: string;
  track_id: string | null;
  days: number[]; // 0=Sun..6=Sat
  start_time: string;
  duration_min: number;
}
export function parseRrule(rrule: string): number[]; // BYDAY -> days, throws on unsupported
export function routineOccurrences(r: RoutineSpec, fromDay: number, toDay: number): number[];
// fromDay/toDay = epoch ms at local midnight; returns occurrence-day midnights inclusive

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
// schedule mode: fill each routine occurrence in [fromDay, toDay] with the next
// unfinished topic of that routine's track in topological order (deps first, then
// position); routines without track_id get topic_id null + title 'estudo livre'.
export function allocateSchedule(
  routines: RoutineSpec[],
  topics: PlannerTopic[],
  fromDay: number,
  toDay: number,
): PlanBlock[];

export interface CycleSlotSpec {
  id: string;
  topic_id: string;
  title: string;
  weight: number;
  position: number;
}
// weighted round-robin; pointer = total picks already made (persisted by caller in settings)
export function cycleNext(
  slots: CycleSlotSpec[],
  pointer: number,
): { slot: CycleSlotSpec; nextPointer: number } | null;

// replan(todayDay): overdue plan-days are redistributed strictly forward over the next
// occurrences (idempotent: same inputs -> same outputs; never emits past days).
// M3 keeps plan blocks derived (not persisted), so replan == allocateSchedule over
// [todayDay, todayDay + horizonDays - 1] — the function exists to make that policy
// explicit and testable. `todayDay` is epoch ms of TODAY'S LOCAL MIDNIGHT, normalized
// by the caller (core cannot derive a local midnight from a raw timestamp).
export function replan(
  routines: RoutineSpec[],
  topics: PlannerTopic[],
  todayDay: number,
  horizonDays: number,
): PlanBlock[];

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
export function buildToday(inputs: TodayInputs, now: number): TodayItem[];
// order: overdue reviews (dueAt < now), due reminders (notify_at <= now; not-yet-due
// reminders are omitted), today's blocks (input array order — allocateSchedule emits
// them per-day in start_time order), fresh reviews (dueAt null or >= now, undated last)
```

### stats

```ts
export interface SessionSlice {
  started_at: number;
  net_seconds: number;
  track_id: string | null;
  topic_id: string | null;
  questions_total: number | null;
  questions_correct: number | null;
}
export interface ReviewSlice {
  reviewed_at: number;
  rating: number;
  ref_id: string;
  ref_kind: string;
}
export function netSecondsPerDay(
  s: SessionSlice[],
  fromDay: number,
  toDay: number,
): { day: number; seconds: number }[]; // every day in range, zero-filled
export function currentStreak(perDay: { day: number; seconds: number }[], now: number): number;
// consecutive days (ending today or yesterday) with seconds > 0
export function accuracyByTrack(
  s: SessionSlice[],
): { track_id: string | null; total: number; correct: number; pct: number | null }[];
// pct is 0..100 over sessions with questions_total > 0; null when a track has none
export function periodComparison(
  s: SessionSlice[],
  now: number,
): { thisWeek: number; lastWeek: number; deltaPct: number | null }; // net seconds, ISO weeks starting Monday
export interface WeakTopic {
  topic_id: string;
  score: number;
} // higher = weaker
export function weakTopics(
  reviews: ReviewSlice[],
  sessions: SessionSlice[],
  limit?: number,
): WeakTopic[];
// low ratings (1-2 share, weight 0.7) x normalized inverse net time (weight 0.3);
// only topics with >= 3 reviews; limit default 5. M3 limitation: only reviews with
// ref_kind 'topic' are scored — card reviews carry no card->topic mapping in the slice.
```

## packages/db (stream B)

Same house style (localWrite, bumpedTs). Signatures:

```ts
// repo/routines.ts
createRoutine(db, deviceId, { title, track_id?, rrule, start_time, duration_min }): Promise<RoutineRow>
listRoutines(db): Promise<RoutineRow[]>            // active, not deleted
updateRoutine(db, deviceId, id, patch): Promise<RoutineRow | null>
deleteRoutine(db, deviceId, id): Promise<void>

// repo/targets.ts
createTarget(db, deviceId, { track_id?, metric, period, value }): Promise<TargetRow>
listTargets(db): Promise<TargetRow[]>
deleteTarget(db, deviceId, id): Promise<void>
targetProgress(db, target, now): Promise<number>   // 0..1; metric net_hours|questions|reviews|sessions over current period

// repo/reminders.ts
createReminder(db, deviceId, { title, notify_at, rrule?, ref_kind?, ref_id? }): Promise<ReminderRow>
listReminders(db): Promise<ReminderRow[]>
dueReminders(db, now): Promise<ReminderRow[]>      // notify_at <= now, not deleted
deleteReminder(db, deviceId, id): Promise<void>

// repo/cycle.ts
setCycleSlots(db, deviceId, trackId, slots: { topic_id, weight }[]): Promise<void> // replace-all atomic
listCycleSlots(db, trackId): Promise<CycleSlotRow[]>
getCyclePointer(db, trackId): Promise<number>      // settings key `cycle_pointer:<trackId>`, local-only
setCyclePointer(db, trackId, n): Promise<void>

// repo/stats-queries.ts (read-only feeds for core/stats)
sessionSlices(db, fromMs): Promise<SessionSliceRow[]>
reviewSlices(db, fromMs): Promise<ReviewSliceRow[]> // review_logs joined to fsrs_state ref
plannerTopics(db, trackIds?): Promise<PlannerTopicRow[]> // topics + deps aggregated
```

### apps/worker (stream B too)

- `POST /push/subscribe` (bearer): body `{ device_id, endpoint, p256dh, auth }` → upsert
  into `push_subscriptions` (id = device_id, replace).
- `cron.ts` + wrangler `triggers.crons = ["*/5 * * * *"]`: query D1 `reminders` due in the
  last 5 min window (synced there via oplog), for each subscription send a **payload-less**
  web push (VAPID JWT via WebCrypto ES256; secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`). No payload encryption in M3 — the SW shows a generic notification.
  Delete subscriptions on 404/410.
- `GET /push/vapid` (bearer): returns `{ publicKey }` for the subscribe flow.

## UI (streams C and D)

Stream C owns `/routines/**` and the cycle-mode editor inside `/tracks/[id]/**`.
Stream D owns `/stats/**`, `/reminders/**`, Today (`routes/+page.svelte`), push/notification
plumbing (`lib/push/*`, `static/sw.js`) and `.ics` export.

### /routines (C)

Weekly grid (7 columns seg..dom) showing routine blocks at their times.
Testids: `routine-form`, `routine-title-input`, `routine-days` (7 toggle buttons
`routine-day-0`..`routine-day-6`), `routine-start-input` (time), `routine-duration-input`,
`routine-track-select`, `routine-submit`, `routine-grid`, `routine-block`,
`routine-delete`. Copy: dias `dom seg ter qua qui sex sáb`.

### Cycle editor on /tracks/[id] (C)

Mode toggle on the track page (`track-mode-toggle`, schedule ↔ cycle). When cycle:
`cycle-editor`, rows `cycle-slot` (topic title + `cycle-weight-input` 1..5), add via
`cycle-add-select` + `cycle-add-submit`, remove `cycle-remove`. Persist via setCycleSlots.
Uses updateTrack — B adds `updateTrack(db, deviceId, id, patch)` to repo/tracks.ts
(additive, allowed).

### / Today additions (D)

- Plan blocks + reminders merged via core `buildToday` (testids stay: `today-queue`,
  `today-item`; add `today-item-kind` attr `data-kind="review|block|reminder"`).
- Targets progress: `target-progress` bar(s) above the queue (4px bar per ds), label
  `meta · 2h10 / 4h` style, from targetProgress.
- Replan note when overdue plan existed: calm line `ontem ficou pendente — redistribuído.`
  (`replan-note`) — shown when any routine occurrence before today had unfinished topics
  (derive cheaply; do not persist).

### /stats (D)

`stats-heatmap` (last 12 weeks, amber alpha steps --heat-0..4 by net hours/day),
`stats-streak` (`N dias de constância`, tabular), `stats-accuracy` list per track
(`stats-accuracy-row`: track title · pct), `stats-comparison` (esta semana vs anterior,
delta), `stats-weak` list (`stats-weak-row`). All client-side from repo feeds + core/stats.
No chart lib — hand-rolled divs/svg with tokens.

### /reminders (D)

`reminder-form`, `reminder-title-input`, `reminder-datetime-input`, `reminder-submit`,
`reminder-list`, `reminder-item`, `reminder-delete`. Local notifications: on app open, if
permission granted show Notification for dueReminders (throttle: only ones not yet
notified this session). Permission ask via explicit button `notifications-enable`
(never on load). Push subscribe flow behind `push-enable` button: fetch VAPID key,
`pushManager.subscribe`, POST /push/subscribe. `.ics` export: `ics-export` button downloads
`studyos.ics` generated from routines (VEVENT with RRULE weekly BYDAY).

### static/sw.js + registration (D)

Minimal service worker: `push` event → `showNotification('StudyOS', { body: 'lembrete de
estudo · abra o app' })`; `notificationclick` → focus/open `/`. Registered from the layout
ONLY via a small `lib/push/register.ts` called in existing onMount (D may add ONE import +
one call line to +layout.svelte's onMount — the only layout touch allowed, coordinate by
keeping the diff to those two lines).

Copy rules unchanged: pt-BR sentence case, `·` separators, no icons/emoji, calm tone.
