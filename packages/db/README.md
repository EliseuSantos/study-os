# @studyos/db

Local-first data layer: SQLite schema, drivers (`bun:sqlite`, D1), typed repos,
oplog-based LWW sync. See `docs/SYNC.md` for the wire protocol.

## Migrations

`migrate(driver, migrations)` reads `PRAGMA user_version` and applies every
migration with `version > current` in ascending order, then sets
`PRAGMA user_version = N`.

Constraints and tradeoffs:

- Migration SQL is split naively on `;` — no triggers or `BEGIN` blocks in
  migration files (documented constraint).
- The statements of one migration run in a single atomic `driver.batch()`.
  PRAGMAs cannot run inside a batch on all drivers, so the `user_version` bump
  runs as a separate `exec` afterwards. If the process dies between the batch
  and the bump, the next run re-applies the migration and fails loudly (e.g.
  `CREATE TABLE` already exists) instead of silently corrupting — an accepted
  M1 tradeoff. Recovery: bump `user_version` manually or reset the local DB.

## Entry points

- `@studyos/db` — driver types, table registry, LWW helpers, `migrate`, repos
  (`settings`, `oplog`, `goals`), client sync (`applyPullPage`, `syncNow`).
  Browser-safe: never imports `bun:sqlite`.
- `@studyos/db/adapters/bun-sqlite` — `bunSqliteDriver` (Bun only).
- `@studyos/db/adapters/d1` — `d1Driver` over a minimal structural D1 type.
- `@studyos/db/sync/server-core` — server-side push/pull statement builders.
