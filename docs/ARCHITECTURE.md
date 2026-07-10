# Architecture (M1)

Local-first: all user data lives in an on-device SQLite database (wa-sqlite over OPFS).
An optional Cloudflare Worker mirrors it to D1 for multi-device sync. The app is fully
functional with zero cloud configured.

```
UI (Svelte 5 runes)
  → lib/repo (@studyos/db, typed — the only path to the DB)
    → wa-sqlite Web Worker (OPFS)        ← source of truth
        ↓ oplog (same transaction)
      sync client ⇄ Worker /sync ⇄ D1    ← mirror
```

## Monorepo

| Path                  | What                                                                                                                                                              | Platform deps                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/pwa`            | SvelteKit SPA (adapter-static, no SSR), Tailwind v4 themed by `@studyos/design` tokens                                                                                        | browser                                    |
| `apps/worker`         | Hono on Cloudflare Workers: `/sync/*`, content proxies (YouTube, RSS, Firecrawl web search/reader with a monthly D1 credit budget), sharing, serves the built PWA | workerd                                    |
| `packages/db`         | `schema.sql` migrations, `DbDriver` seam, repo layer, LWW sync engine + server core                                                                               | none in `src/` (adapters are deep exports) |
| `packages/shared`     | row types, sync wire types, uuidv7 ids, constants                                                                                                                 | none                                       |
| `packages/core`       | pure domain logic: fsrs / planner / outline-parser / stats (stubs until M2)                                                                                       | none                                       |
| `packages/design`     | design-system source of truth: CSS tokens (dark default + `[data-theme="light"]`), self-hosted fonts, brand guidelines | none (plain CSS/assets)                    |
| `packages/connectors` | content source connectors (M4)                                                                                                                                    | none                                       |

Packages are consumed as TypeScript source (`exports: ./src/index.ts`) — no build step
outside the two apps. Turborepo orchestrates `build/lint/typecheck/test`; `worker#build`
depends on `pwa#build` (asset directory).

## The DbDriver seam

```ts
interface DbDriver {
  exec(sql, params?): Promise<Row[]>;
  batch(stmts): Promise<void>; // atomic
}
```

One interface, three runtimes: the wa-sqlite worker (postMessage RPC), `bun:sqlite`
(tests), D1 (worker). The repo layer composes entity write + oplog append into a single
`batch()` — the oplog invariant is structural, not conventional. Remote ops are applied
through a separate path that never writes oplog (no ping-pong).

Reactive reads: repo queries wrapped by `liveQuery` (Svelte 5 `$state`), invalidated by
table-change events broadcast on a `BroadcastChannel` after each mutating batch — which
also keeps multiple tabs coherent.

## Sync

Last-write-wins by `updated_at` (strictly greater applies). Full protocol, wire format
and edge-case rationale: [SYNC.md](./SYNC.md). The LWW apply logic is shared verbatim
between the Worker and the bun tests (`packages/db/src/sync/server-core.ts`), so the
two-device convergence tests exercise the same code that runs in production.

## Testing

- `bun test` everywhere logic lives; DB tests run the real `0001_init.sql` on `bun:sqlite`.
- Worker tests drive the real Hono app via `app.request()` with a FakeD1 over bun:sqlite.
- Two-device convergence: in-memory transport (packages/db) and real HTTP app (apps/worker).
- Cypress e2e (Chrome/Chromium only — OPFS): `smoke.cy.ts` (offline persistence across
  reload) and `sync.cy.ts` (browser → worker loop; self-skips when the worker is down).

## Free-tier discipline

Sync batches up to 500 ops per request, is single-flight with exponential backoff, and
only auto-triggers when there are unsent oplog rows. The PWA is served from the same
Worker (static assets), so no extra origin, no CORS preflights.
