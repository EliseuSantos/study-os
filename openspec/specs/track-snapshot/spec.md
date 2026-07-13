# track-snapshot

## Purpose

One portable format (`.studyos.json`) backs file export/import, link + QR sharing via
R2 and the seed templates in `templates/`. Teachers share tracks; students import them
as fresh study tracks. Format lives in `packages/core/src/snapshot`; import in
`packages/db/src/repo/snapshot.ts`; share API in `apps/worker/src/share.ts`.
## Requirements
### Requirement: Portable uuid-free format

Snapshots SHALL be self-contained with local ordinal keys (never uuids): `format:
'studyos-track'`, `version: 1`, `track`, `topics[key, parent_key, …]`, `cards`,
`lessons`, `lesson_items`, `content`. `parseSnapshot` SHALL validate structure and
referential integrity, throwing `'invalid snapshot: <why>'`. Content-kind lesson items
export as kind `note` with a markdown link body.

#### Scenario: Round trip

- **WHEN** a track is exported and re-imported on another device
- **THEN** topics (with hierarchy), cards, lessons and items match the original

### Requirement: Deterministic content hash

`snapshotHash` SHALL hash canonical JSON (recursively sorted keys, `exported_at`
excluded) with FNV-1a 64-bit, returning 16 hex chars. The hash powers
`origin_version` update detection ('há uma versão mais nova desta trilha
compartilhada.' — `origin-update-note`).

#### Scenario: Stability and sensitivity

- **WHEN** only key order or `exported_at` differ
- **THEN** the hash is identical; any content change produces a different hash

### Requirement: Atomic import

`importSnapshot(db, deviceId, snapshot, { origin, origin_version })` SHALL create the
track, topics (ordinal → fresh uuids), cards, lessons, items and content in ONE atomic
batch, with origins `file` | `share:<id>` | `template:<slug>`. No FSRS state travels —
imported cards surface as new/due.

#### Scenario: Poisoned snapshot

- **WHEN** a snapshot with duplicate topic keys is imported
- **THEN** the import throws and zero rows exist in every table (including oplog)

### Requirement: Share API

`POST /share` (bearer) SHALL validate the snapshot (400), cap the body at 1 MB (413),
gzip to R2 `shares/<id>.json.gz` and record `{id, version_hash, r2_key, title}` in D1
`track_shares`, returning `{ id, hash }`. `GET /share/:id` SHALL be **public** (students
import without a token), cached 1h, answering `{ snapshot, hash }` or 404.

#### Scenario: Student import via link

- **WHEN** `/import?share=<id>` fetches a valid share
- **THEN** `import-preview` shows title and counts and `import-confirm` creates the
  track with origin `share:<id>`

### Requirement: Quiz item encoding

Quiz lesson items SHALL store JSON in `body_md`: `{"q": string, "options": string[],
"answer": number}` with `answer` as the **0-based** index. UI inputs are 1-based and
convert on save/load. Consumers SHALL parse defensively (bad JSON renders as a note).

#### Scenario: Authoring round trip

- **WHEN** a teacher marks option 2 (1-based) as correct in the editor
- **THEN** `body_md` stores `"answer": 1` and the presentation reveals that option

### Requirement: Snapshot version

The snapshot payload SHALL carry `version: number` (integer ≥ 1; absent = 1 for
backward compatibility). Republishing to the same share id MUST bump the version;
consumers MUST ignore payloads whose version is lower than the one already imported.

#### Scenario: Republish bumps

- **WHEN** a teacher republishes a track already shared at version 3
- **THEN** the stored snapshot has version 4 under the same share id

### Requirement: Update banner on imported tracks

An imported track SHALL remember its origin share id and version. When a newer origin
version is detected (online check through the existing cached proxy), the track detail
shows `track-update-banner` with the copy "esta trilha tem uma versão nova do
professor — atualizar mantém seu progresso." and the actions `track-update-apply` /
`track-update-dismiss` (dismiss silences that version only).

#### Scenario: Newer version detected

- **WHEN** the origin share is at version 5 and the local import was version 4
- **THEN** `track-update-banner` is visible on that track

### Requirement: Progress-preserving merge

Applying an update SHALL merge, in one atomic batch through the repos: topics matched
by stable snapshot id keep local `status`, fsrs state and cards; topics absent from
the new version are soft-deleted; new topics are inserted as `pending`. The local
origin version is set to the applied version.

#### Scenario: Progress survives

- **WHEN** a student with 10 dominated topics applies an update that renames 2 topics
  and adds 3
- **THEN** the 10 `done` statuses remain and the 3 new topics appear as `pending`

## Notes

UI testids: `export-json`, `share-track`, `share-url`, `share-copy`, `share-qr`,
`origin-update-note`, `import-json-input`, `import-preview`, `import-confirm`.
Templates validate in CI via `bun run validate:templates`. Coverage:
`packages/core/test/snapshot.test.ts`, `packages/db/test/repo-snapshot.test.ts`,
`apps/worker/test/share.test.ts`, `cypress/e2e/teacher-loop.cy.ts`.
