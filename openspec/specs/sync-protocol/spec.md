# sync-protocol

## Purpose

Single-user, last-write-wins multi-device sync. Local wa-sqlite (OPFS) is the source of
truth; D1 is a mirror behind the Worker. Wire types live in
`packages/shared/src/sync-types.ts`; the LWW apply logic is shared verbatim between the
Worker and bun tests (`packages/db/src/sync/server-core.ts`).

## Requirements

### Requirement: Oplog on every local write

Every write to a synced table SHALL append an `oplog` row in the same atomic batch as
the entity write (`localWrite`/`localWriteStmts`). Wire payloads SHALL be full rows
(the LWW upsert writes every declared column — a missing column would become NULL).
Soft deletes SHALL travel as upserts with `deleted_at` set.

#### Scenario: Atomicity

- **WHEN** a synced-table write fails mid-batch
- **THEN** neither the entity row nor the oplog row is persisted

### Requirement: Remote applies never write oplog

Remote ops SHALL be applied through `applyRemote*` (entity table only, LWW-guarded).
Writing oplog during a remote apply is forbidden (it would ping-pong ops between
devices forever).

#### Scenario: Pull application

- **WHEN** a pull page is applied
- **THEN** entity rows change per LWW and the oplog row count is unchanged

### Requirement: Push endpoint

`POST /sync/push` (bearer `SYNC_TOKEN`) SHALL accept `PushRequest { device_id, ops }`,
validate each op's `tbl` against `SYNCED_TABLES` (400 on unknown), and apply entity +
`server_oplog` upserts in one atomic `D1.batch()` with the guard
`incoming.updated_at > existing.updated_at`.

#### Scenario: Older write loses

- **WHEN** an op arrives whose `updated_at` is older than the stored row
- **THEN** the stored row is unchanged and the push still answers 200

### Requirement: Pull endpoint

`GET /sync/pull?since=<ms>&device=<id>` (bearer) SHALL return ops from `server_oplog`
with `updated_at >= since` excluding the caller's `device_id`, ordered by
`(updated_at, row_id)`, limited to 500, as `PullResponse { ops, cursor, has_more }`.
The `>=` is intentional: same-millisecond ops are never skipped, and re-delivery is
safe because the client apply is idempotent (strict `>` guard).

#### Scenario: Own ops excluded

- **WHEN** device A pulls after pushing
- **THEN** the response contains no ops with `device_id` A

### Requirement: Client sync loop

The client SHALL push unsent oplog rows in batches of 500 (marking them synced on 2xx),
then pull from the cursor stored in `settings` until `has_more` is false, applying each
page and advancing the cursor in one atomic batch. Triggers: app open, `online` event,
3s debounce after a local write (skipped when nothing is unsent), manual button.
Single-flight with exponential backoff; offline skips silently. `settings` (device_id,
sync_cursor, sync_token, cycle pointers) SHALL never sync; `topic_deps` and
`review_logs` don't sync (no `updated_at`).

#### Scenario: Two devices converge

- **WHEN** devices A and B edit the same row offline and both sync
- **THEN** both end up with the newer `updated_at` version

## Notes

Byte-level wire examples and the settings-key list: `docs/SYNC.md` (narrative
companion). Coverage: `packages/db/test/{lww,apply,two-device}.test.ts`,
`apps/worker/test/{push-pull,two-device-http}.test.ts`, `cypress/e2e/sync.cy.ts`.
