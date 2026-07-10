# M2 contracts (frozen for parallel workstreams)

Student core: tracks + topic tree + outline import + cards + FSRS review + study timer +
Today queue. Everything works offline; sync rides on the existing oplog for the synced
tables (`review_logs` stays local-only — no `updated_at`).

## packages/core (implemented by stream A)

### fsrs

```ts
export type Rating = 1 | 2 | 3 | 4; // again | hard | good | easy
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
export function initialSchedulerState(): SchedulerState;
export function schedule(s: SchedulerState, rating: Rating, now: number): SchedulerState;
export function retrievability(s: SchedulerState, now: number): number; // 0..1, 1 for new
```

FSRS-5 with default weights, desired retention 0.9, fuzz OFF (deterministic).
Maps 1:1 to the `fsrs_state` row columns (`FsrsStateRow` minus id/ref).

### outline-parser

```ts
export interface OutlineNode {
  title: string;
  depth: number; // 0-based
  children: OutlineNode[];
}
export function parseOutline(text: string): OutlineNode[];
```

Accepts markdown headings (#..######) and/or indented lists (-, *, 1., tabs or 2+ spaces);
mixed input allowed; blank lines ignored; plain top-level lines become depth-0 nodes.

### planner (M2 slice only)

```ts
export interface QueueItem {
  kind: 'review';
  ref_kind: 'card' | 'topic';
  ref_id: string;
  due_at: number;
  title: string;
}
export function dailyQueue(items: QueueItem[], now: number): QueueItem[]; // due first, then by due_at asc
```

## packages/db repos (implemented by stream B, consumed by C/D)

All writes to synced tables go through `localWrite` (oplog invariant). Same style as
`repo/goals.ts` (full-row types from `@studyos/shared`, `bumpedTs` on updates).

```ts
// repo/tracks.ts
createTrack(db, deviceId, { title, goal_id?, description?, mode? }): Promise<TrackRow>
listTracks(db): Promise<TrackRow[]>
getTrack(db, id): Promise<TrackRow | null>
deleteTrack(db, deviceId, id): Promise<void>

// repo/topics.ts
createTopic(db, deviceId, { track_id, parent_id?, title, position?, notes_md? }): Promise<TopicRow>
createTopicTree(db, deviceId, trackId, nodes: OutlineNodeInput[]): Promise<number> // atomic bulk import, returns count
listTopics(db, trackId): Promise<TopicRow[]> // position order; UI builds the tree
setTopicStatus(db, deviceId, id, status: 'pending' | 'studying' | 'done'): Promise<void>
deleteTopic(db, deviceId, id): Promise<void>
// OutlineNodeInput = { title: string; children: OutlineNodeInput[] } (no core dep in db)

// repo/cards.ts
createCard(db, deviceId, { topic_id, kind?, front_md, back_md? }): Promise<CardRow>
listCardsByTopic(db, topicId): Promise<CardRow[]>
listCardsByTrack(db, trackId): Promise<CardRow[]>
deleteCard(db, deviceId, id): Promise<void>

// repo/fsrs.ts
getFsrsState(db, refKind: 'card' | 'topic', refId): Promise<FsrsStateRow | null>
recordReview(db, deviceId, args: {
  refKind: 'card' | 'topic'; refId: string;
  next: SchedulerStateShape; // structural copy of core SchedulerState — db does NOT import core
  rating: 1 | 2 | 3 | 4; reviewedAt: number; elapsedMs?: number;
}): Promise<FsrsStateRow>
// upserts fsrs_state via localWrite AND inserts review_logs (plain, local-only) in ONE batch
listDueReviews(db, now, limit?): Promise<DueReview[]>
// DueReview = { fsrs: FsrsStateRow; title: string } joined to cards.front_md/topics.title;
// includes NEW cards (no fsrs_state row yet) as due now; excludes soft-deleted refs

// repo/sessions.ts
startSession(db, deviceId, { track_id?, topic_id?, type }): Promise<SessionRow>
finishSession(db, deviceId, id, patch: { ended_at, net_seconds, focused?, pages_read?,
  videos_watched?, questions_total?, questions_correct?, notes? }): Promise<SessionRow | null>
listRecentSessions(db, limit?): Promise<SessionRow[]>

// repo/checklists.ts
addChecklistItem(db, deviceId, { ref_kind, ref_id, title, position? }): Promise<ChecklistItemRow>
listChecklist(db, refKind, refId): Promise<ChecklistItemRow[]>
toggleChecklistItem(db, deviceId, id, done: boolean): Promise<void>
deleteChecklistItem(db, deviceId, id): Promise<void>
```

## UI routes + testids (streams C and D; e2e is written against these)

Stream C owns `/tracks/**`; stream D owns `/`, `/review`, `/study` and
`lib/components/Checklist.svelte`. Neither touches the other's files.

### /tracks (C)

`track-form`, `track-title-input`, `track-submit`, `track-list`, `track-item` (link to detail)

### /tracks/[id] (C)

- Tree: `topic-tree`, `topic-item` (indented by depth), `topic-title`,
  `topic-status-toggle` (cycles pending → studying → done), `topic-add-child`
- Inline create: `topic-form`, `topic-title-input`, `topic-submit`
- Import: `outline-import-open` (button), `outline-input` (textarea),
  `outline-preview` (live tree preview), `outline-preview-item`, `outline-confirm`
- Cards (per selected topic): `card-form`, `card-front-input`, `card-back-input`,
  `card-submit`, `card-list`, `card-item`

### / Today (D — replaces the goals-only placeholder; goals block stays)

`today-queue`, `today-item` (title + due label), `start-next` (→ /review),
`today-empty` ("fila zerada…" calm empty state)

### /review (D)

`review-card`, `review-front`, `review-reveal` (button), `review-back`,
`rating-1` `rating-2` `rating-3` `rating-4`, `review-remaining` (count),
`review-empty` (queue done state)

### /study (D)

`study-timer` (tabular numbers, mm:ss), `timer-start`, `timer-pause`, `timer-resume`,
`timer-finish`, `session-form` (post-session log: `session-type-select`,
`session-questions-total`, `session-questions-correct`, `session-notes`, `session-save`)

Copy: pt-BR sentence case, calm tone, `·` separators, no icons/emoji (ds/ rules).
Review ratings labels: `errei` / `difícil` / `bom` / `fácil`.
