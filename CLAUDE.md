# StudyOS — agent context

Open-source (AGPL-3.0), local-first study platform (pt-BR) for exam candidates and
teachers. All user data lives in on-device SQLite (wa-sqlite over OPFS); a single
Cloudflare Worker adds optional sync (D1, LWW), web push, content proxies and track
sharing (R2). The app must be fully functional offline with zero cloud configured.

## Spec-driven development

Non-trivial features start with a spec in [`specs/`](specs/README.md) (copy
`specs/TEMPLATE.md`). Freeze the contracts (types, wire formats, testids, acceptance
criteria) **before** implementing; code against the frozen spec; verify against its
acceptance criteria; keep the spec updated as living documentation. Living contracts:
[docs/SYNC.md](docs/SYNC.md), [specs/content-connectors.md](specs/content-connectors.md),
[specs/track-snapshot.md](specs/track-snapshot.md).

## Monorepo (Bun workspaces + Turborepo)

| Path                  | What                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pwa`            | SvelteKit SPA (Svelte 5 runes, adapter-static, no SSR), Tailwind v4                                                                      |
| `apps/worker`         | Hono on Cloudflare Workers: sync, push cron, proxies, share, serves the PWA build                                                        |
| `packages/db`         | migrations, `DbDriver` seam (wa-sqlite/bun:sqlite/D1), repo layer, sync engine                                                           |
| `packages/core`       | pure domain logic: fsrs, planner, outline-parser, stats, snapshot — zero platform deps                                                   |
| `packages/connectors` | fetch-injectable content sources (wikipedia, stackexchange, youtube, web)                                                                |
| `packages/design`     | `@studyos/design`: CSS tokens (dark default, light via `[data-theme="light"]`), fonts, brand rules ([readme](packages/design/readme.md)) |
| `packages/shared`     | row types, sync wire types, uuidv7, constants                                                                                            |

Apps depend on packages; packages never depend on apps; packages are consumed as TS
source (`exports: ./src/index.ts`) — no build step outside the two apps.

## Commands

```sh
bun install
bun x turbo typecheck lint test build        # full pipeline (same as CI)
bun run validate:templates                   # snapshot templates against the format
cd apps/worker && bun x wrangler d1 migrations apply studyos --local && bun run dev  # :8787
cd apps/pwa && bun run dev                   # :5173, proxies /sync and /proxy to :8787
cd apps/pwa && bun run build && bun x vite preview --port 4173   # e2e target
cd apps/pwa && bun x cypress run --browser chromium              # e2e (Chromium only — OPFS)
```

## Hard rules

- **DB access only through `packages/db` repos** — components never write SQL.
- **Oplog invariant**: every synced-table write goes through `localWrite`/
  `localWriteStmts` (entity + oplog row in ONE atomic batch). Remote applies use
  `applyRemote*` and must NEVER write oplog (ping-pong). Soft deletes only
  (`deleted_at`); wire payloads are always full rows.
- `settings` is local-only (device_id, sync_cursor, sync_token, cycle pointers) — never
  synced. `topic_deps`/`review_logs` don't sync (no `updated_at`).
- **Migrations** (`packages/db/migrations/`): plain DDL, no triggers/BEGIN, one statement
  per `;`, trailing `;` on the last statement (wrangler concatenates its bookkeeping
  INSERT). Applied by user_version runner (client) and `wrangler d1 migrations apply`
  (D1). New migration ⇒ also add its `?raw` import in `apps/pwa/src/lib/db/worker.ts`
  (FakeD1 picks up `migrations/*.sql` automatically).
- **FTS5 is client-side only** — D1 doesn't support it; never add `search_index` to
  shared migrations.
- **Styling**: `@studyos/design` tokens only — no raw hex/px, one amber accent + one dry
  green, hairlines not boxes, no icons/emoji (geometric glyphs `▸ ▾ · → × ✓`), numbers
  always tabular. UI copy: pt-BR sentence case, calm and never punitive.
- **Testing**: `bun test` where logic lives (db tests run the real migrations on
  bun:sqlite; worker tests drive the real Hono app via `app.request()` with FakeD1/R2/
  Cache); Cypress e2e against testids only, network intercepted, Chromium only. New UI
  needs its testids in the feature spec.
- Timestamps: epoch ms UTC. IDs: uuidv7 (`newId()` from `@studyos/shared`).
- TS strict everywhere (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`);
  no `any` (quarantined shims only); comments only for non-obvious "why".
- Free-tier discipline: cache aggressively (Cache API seam in `apps/worker/src/cache.ts`),
  budget external APIs in D1 `proxy_usage` (fail closed, calm UI note), batch sync.

## Scope decisions (do not revisit without the owner asking)

- Tooling is locked: Turborepo, oxlint (not eslint), bun test (not jest), Cypress (not
  Playwright), Prettier.
- **No Anki importer. No TTS.** Explicitly vetoed by the owner.
- The README promotes the hosted platform; self-hosting stays documented in
  [docs/DEPLOY.md](docs/DEPLOY.md) only.

## Gotchas

- Quiz lesson items: `body_md` JSON `{"q","options","answer"}` with **0-based** answer;
  UI inputs are 1-based (see specs/track-snapshot.md).
- RRULE subset: only `FREQ=WEEKLY;BYDAY=SU..SA` (parser in `packages/core/planner`).
- Cypress 15 `cy.exec` results expose `exitCode`, not `code`.
- `GET /share/:id` is public by design; everything else under the worker is
  bearer-auth'd (`SYNC_TOKEN`).
- Local dev secrets in `apps/worker/.dev.vars` (`.dev.vars.example` lists them); VAPID
  pair via `bun run scripts/gen-vapid.ts`.
