# Track snapshot (`.studyos.json`) & sharing

status: implemented
owner: Eliseu

## Context

Teachers export/share tracks; students import them as their own study tracks (fresh
FSRS state). One portable format backs file export, link/QR sharing via R2 and the seed
templates in `templates/`.

## Requirements

1. Snapshots are self-contained and uuid-free (local ordinal keys) so any device can
   import them.
2. The content hash is deterministic (key-order independent, `exported_at` excluded) —
   it powers `origin_version` update detection.
3. Import is atomic: a malformed snapshot creates zero rows.

## Contracts

### Format (`packages/core/src/snapshot`)

```ts
interface TrackSnapshot {
  format: 'studyos-track'; version: 1; exported_at: number;
  track: { title; description; mode };
  topics: { key; parent_key; title; notes_md; position }[];   // keys = local ordinals
  cards: { topic_key; kind; front_md; back_md; options_json }[];
  lessons: { key; title; presenter_notes_md; estimated_duration_min; position }[];
  lesson_items: { lesson_key; topic_key; kind; body_md; position }[];
  content: { topic_key; source; external_id; url; title; kind }[];
}
buildSnapshot(rows): TrackSnapshot   // content lesson-items export as kind 'note' with a markdown link body
parseSnapshot(json): TrackSnapshot   // structural + referential validation; throws 'invalid snapshot: <why>'
snapshotHash(s): string              // canonical JSON (sorted keys, no exported_at) → FNV-1a 64-bit hex
```

Quiz lesson items store JSON in `body_md`: `{"q": string, "options": string[],
"answer": number}` — `answer` is the **0-based** index (UI inputs are 1-based, convert
on save/load). Parse defensively; bad JSON renders as a note.

### Import (`packages/db/repo/snapshot.ts`)

`importSnapshot(db, deviceId, snapshot, { origin, origin_version })` — ONE atomic batch,
ordinal keys → fresh uuids, origins: `file` | `share:<id>` | `template:<slug>`. No FSRS
rows travel — imported cards surface as new/due.

### Share API (`apps/worker`)

- `POST /share` (bearer): snapshot JSON body, 1 MB cap (413), validation (400) →
  gzip → R2 `shares/<id>.json.gz` + D1 `track_shares` row. Returns `{ id, hash }`.
- `GET /share/:id` (**public** — students import without a token): `{ snapshot, hash }`,
  404 unknown, cached 1h.

### UI testids

```
track:  export-json, share-track, share-url, share-copy, share-qr, origin-update-note,
        import-json-input
import: import-preview, import-confirm  (route /import?share=<id>)
```

Copy: 'há uma versão mais nova desta trilha compartilhada.' · 'link inválido ou expirado.'

## Acceptance criteria

1. Export → re-import round-trips the track (topics, lessons, cards) —
   `teacher-loop.cy.ts`.
2. Share (stubbed worker) shows URL + QR; import from a share link previews and creates
   the track — same spec.
3. Poisoned snapshot (duplicate keys) imports zero rows —
   `packages/db/test/repo-snapshot.test.ts`.
4. Hash is stable across key order and `exported_at`, differs on content —
   `packages/core/test/snapshot.test.ts`.
5. Templates validate in CI — `bun run validate:templates`.

## Verification

`bun x turbo typecheck lint test build` + `bun run validate:templates` green; Cypress
`teacher-loop.cy.ts` green.
