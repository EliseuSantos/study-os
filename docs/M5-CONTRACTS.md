# M5 contracts (frozen for parallel workstreams)

Teacher mode: lesson authoring, presentation + presenter view, interactive quiz,
`.studyos.json` export/import, share via Worker → R2 + QR, `origin_version` update
detection, `templates/` format + CI validation. Done when: author a lesson → present it →
share QR → import on another device as a student track.

## Snapshot format `.studyos.json` (packages/core, stream A)

```ts
export interface TrackSnapshot {
  format: 'studyos-track';
  version: 1;
  exported_at: number;
  track: { title: string; description: string | null; mode: string };
  topics: {
    key: number;
    parent_key: number | null;
    title: string;
    notes_md: string | null;
    position: number;
  }[]; // keys are LOCAL ordinals, not uuids
  cards: {
    topic_key: number;
    kind: string;
    front_md: string;
    back_md: string | null;
    options_json: string | null;
  }[];
  lessons: {
    key: number;
    title: string;
    presenter_notes_md: string | null;
    estimated_duration_min: number | null;
    position: number;
  }[];
  lesson_items: {
    lesson_key: number;
    topic_key: number | null;
    kind: string;
    body_md: string | null;
    position: number;
  }[]; // content items export as kind 'note' with body_md = title+url markdown
  content: {
    topic_key: number;
    source: string;
    external_id: string | null;
    url: string | null;
    title: string;
    kind: string;
  }[];
}
export function buildSnapshot(input: {
  track: TrackRowShape;
  topics: TopicRowShape[];
  cards: CardRowShape[];
  lessons: LessonRowShape[];
  lessonItems: LessonItemRowShape[];
  content: ContentRowShape[];
}): TrackSnapshot; // structural row shapes local to core
export function parseSnapshot(json: string): TrackSnapshot; // validates; throws Error('invalid snapshot: <why>')
export function snapshotHash(s: TrackSnapshot): string;
// deterministic content hash: canonical JSON (sorted keys, exported_at EXCLUDED) → FNV-1a 64-bit hex (pure, no crypto dep)
```

### templates/ (stream A)

- `templates/schema.json` — JSON Schema (draft-07) for TrackSnapshot (format/version literal).
- `templates/enem-linguagens.json`, `templates/dev-fundamentos.json` — 2 seed templates
  (valid snapshots, ~8-15 topics each, a few cards, 1 lesson each, pt-BR content).
- `scripts/validate-templates.ts` (repo root scripts/) — bun script: parseSnapshot each
  templates/*.json + basic schema keys check; exit 1 on failure. Wired into root
  package.json `"validate:templates"` and CI by integration.

## packages/db (stream B)

```ts
// repo/lessons.ts
createLesson(db, deviceId, { track_id, title, presenter_notes_md?, estimated_duration_min?, position? }): Promise<LessonRow>
listLessons(db, trackId): Promise<LessonRow[]>
updateLesson(db, deviceId, id, patch): Promise<LessonRow | null>
deleteLesson(db, deviceId, id): Promise<void>
addLessonItem(db, deviceId, { lesson_id, kind, topic_id?, content_item_id?, body_md?, position? }): Promise<LessonItemRow>
listLessonItems(db, lessonId): Promise<LessonItemRow[]>
updateLessonItem(db, deviceId, id, patch): Promise<LessonItemRow | null>
deleteLessonItem(db, deviceId, id): Promise<void>
// lesson_items.kind: 'topic' | 'content' | 'quiz' | 'note'; quiz body_md = question,
// options in the card-style options_json? lesson_items has no options column — quiz
// items store JSON in body_md: { "q": string, "options": string[], "answer": number }
// (documented; parse defensively in UI)

// repo/snapshot.ts
exportTrackData(db, trackId): Promise<{ track, topics, cards, lessons, lessonItems, content }>  // feeds core buildSnapshot; rows as-is
importSnapshot(db, deviceId, s: TrackSnapshotShape, origin: { origin: string; origin_version: string }): Promise<string>
// ONE atomic batch: new track (mode from snapshot, origin fields), topics (key→uuid map,
// parent chain, positions), cards, lessons, lesson_items, content_items. Returns track id.
// Imported cards start fresh (no fsrs rows — they appear as new/due in Today).
```

## apps/worker (stream B)

- R2 binding `SHARES` in wrangler.jsonc (`bucket_name: 'studyos-shares'`) + Env type +
  structural `R2BucketLike { get(key): Promise<{ body, text() } | null>; put(key, value, opts?): Promise<unknown> }`.
- `POST /share` (bearer): body = TrackSnapshot json (validated: format/version literals,
  title non-empty, arrays present; size cap 1 MB → 413). Compute hash server-side (same
  FNV-1a — import from `@studyos/core`), id = first 10 hex of hash + 4 random hex,
  gzip via CompressionStream → R2 key `shares/<id>.json.gz`, D1 `track_shares` row
  {id, version_hash, r2_key, title, created_at}. Returns `{ id, hash }`.
- `GET /share/:id` — PUBLIC (no bearer; shared with students). R2 get → gunzip →
  `{ snapshot, hash }` json. 404 unknown. Cache API 1h.
- Tests: FakeR2 (Map) + FakeCache; gzip roundtrip via CompressionStream (bun supports it;
  if not, seam the compression like getCache — verify first). Auth on POST, public GET,
  413 cap, 404, share→get roundtrip preserving snapshot.

## UI (streams C and D)

Stream C owns lesson authoring: `/tracks/[id]/lessons/**` (new nested route or colocated
panel — pick a `LessonsPanel.svelte` + `/tracks/[id]/lessons/[lessonId]/+page.svelte`
editor) + mount line in tracks/[id]/+page.svelte. Stream D owns `/present/[lessonId]/**`,
`/share-import` flow (`/import` route), export/share UI on the track page as a separate
`TrackActions.svelte` component (C mounts nothing for it — D adds its own single mount
line at the BOTTOM of tracks/[id]/+page.svelte after C's content, coordinate: C edits the
mode-toggle area only, D appends one line before the closing container).

### Lesson authoring (C)

- On track page: `lessons-panel`, `lesson-list`, `lesson-item-row` (title · est duration ·
  position), `lesson-add-form` (`lesson-title-input`, `lesson-duration-input`,
  `lesson-submit`), link each lesson to its editor page, `lesson-delete`.
- Editor `/tracks/[id]/lessons/[lessonId]`: `lesson-editor`, presenter notes textarea
  `lesson-notes-input` (persists on blur/debounce via updateLesson), items list
  `lesson-items` with `lesson-item` rows (kind badge + preview), reorder via up/down
  buttons `lesson-item-up`/`lesson-item-down` (swap positions), `lesson-item-delete`.
  Add item: `item-kind-select` (tópico | conteúdo | quiz | nota), then contextual fields:
  topic → `item-topic-select`; content → `item-content-select` (content of the track);
  note → `item-body-input` (markdown textarea); quiz → `quiz-question-input`,
  `quiz-options-input` (one per line textarea), `quiz-answer-input` (1-based number) →
  body_md = JSON per contract. `item-add-submit`.
- 'apresentar →' link `present-link` to `/present/<lessonId>`.

### Presentation + share/import (D)

- `/present/[lessonId]`: fullscreen dark stage (requestFullscreen on `present-start`
  button — browsers demand a gesture; fallback to CSS fullscreen layout if denied).
  One slide per lesson item, `slide` testid + `slide-index` (`3 · 12` tabular).
  Keyboard ← → space, touch: tap right/left half. Slide rendering by kind:
  topic → big Literata title (+ topic notes small); note → markdown-ish plain text
  (render paragraphs, no md lib); content → title + url as visual reference (youtube:
  embed iframe); quiz → question + options as buttons `quiz-option-N`; clicking reveals
  correct (`quiz-correct` on the right one, subdued state on wrong pick; no confetti,
  calm per ds).
  `present-exit` (esc — sair). Presenter view: toggle `presenter-toggle` splits screen:
  current slide small + `presenter-notes` (lesson presenter_notes_md) + `presenter-timer`
  (elapsed, tabular) + `presenter-next` (next item preview).
- Track page `TrackActions.svelte`: `export-json` (download `<title>.studyos.json` from
  exportTrackData + buildSnapshot), `share-track` → POST /share (authed fetch pattern) →
  show `share-url` (absolute `location.origin + '/import?share=' + id`) + `share-qr`
  (uqr `renderSVG` of that url, ~180px) + copy button `share-copy`. Import file:
  `import-json-input` (file input accepting .json) → parseSnapshot → importSnapshot with
  origin `{ origin: 'file', origin_version: hash }` → goto new track.
- `/import?share=<id>` route: fetches PUBLIC `/share/<id>` (plain fetch), shows preview
  (`import-preview`: title, topic/lesson counts), `import-confirm` → importSnapshot with
  origin `{ origin: 'share:'+id, origin_version: hash }` → goto track. Errors calm.
- Update detection: on track page load (inside TrackActions), if track.origin starts with
  'share:', fetch the share, compare hash to track.origin_version → if different show
  `origin-update-note` calm line 'há uma versão mais nova desta trilha compartilhada.'
  (no auto-update in M5).

Copy pt-BR sentence case, tokens only, no icons/emoji. uqr is already in pwa deps.
