# Track templates

Seed tracks distributed with StudyOS as `.studyos.json` snapshots — the same portable
format produced by the track export button (M5). Each `*.json` file here (except
`schema.json`) is one template.

## Format

A template is a `TrackSnapshot` (see `packages/core/src/snapshot`): a self-contained
JSON document with `format: "studyos-track"`, `version: 1`, the track metadata and five
row arrays (`topics`, `cards`, `lessons`, `lesson_items`, `content`). All references use
**local ordinal keys** (integers starting at 0), never uuids — `topics[].key`,
`topics[].parent_key`, `cards[].topic_key`, `lessons[].key`, `lesson_items[].lesson_key`
and so on. `templates/schema.json` is the JSON Schema (draft-07) mirror of the shape.

Notes on specific fields:

- lesson items of kind `quiz` store the question as JSON in `body_md`:
  `{"q": string, "options": string[], "answer": number}` with `answer` as the
  **0-based index** into `options`.
- lesson items of kind `content` never appear in snapshots: exports convert them to
  kind `note` with `body_md = [<title>](<url>)`.
- `exported_at` is informational and excluded from the content hash (`snapshotHash`),
  so template files keep it as a fixed constant.

## Validating

```sh
bun scripts/validate-templates.ts
```

Runs `parseSnapshot` from `@studyos/core` (the source of truth for the format) on every
template and fails the build on the first structural problem. Wired into CI.

## How import works

Importing a template calls `importSnapshot` (packages/db) which creates a new track in
one atomic batch, remapping ordinal keys to fresh uuids. The track is created with
`origin: 'template:<slug>'` (slug = file name without extension) and
`origin_version: snapshotHash(snapshot)`, which later powers update detection.
Imported cards start fresh — no FSRS state travels with a template.
