# StudyOS

Open-source, offline-first study platform. Goals, study tracks, FSRS spaced repetition,
routines, focus timer and content from free sources (YouTube, Wikipedia). Student &
teacher modes. Free forever.

All your data lives on your device (SQLite over OPFS). An optional Cloudflare Worker —
deployed to **your own** free-tier account — adds multi-device sync. No accounts, no
tracking, no server required.

## Status

Milestone 1 (foundation) — offline goal creation, OPFS persistence, and two-device
LWW sync are working end-to-end. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/SYNC.md](docs/SYNC.md).

## Stack

Bun · Turborepo · SvelteKit (Svelte 5) · Tailwind v4 · wa-sqlite (OPFS) · Hono ·
Cloudflare Workers + D1 · oxlint · bun test · Cypress.

## Development

```sh
bun install

# terminal 1 — worker (sync api) with local D1
cd apps/worker
bun x wrangler d1 migrations apply studyos --local
bun run dev            # :8787

# terminal 2 — pwa
cd apps/pwa
bun run dev            # :5173, proxies /sync to :8787
```

Quality gates (same as CI):

```sh
bun run typecheck && bun run lint && bun run test && bun run build
```

E2E (needs Chrome/Chromium — OPFS):

```sh
cd apps/pwa && bun run build && bun x vite preview --port 4173 &
cd apps/pwa && bun run test:e2e
```

## Deploying your sync worker

```sh
cd apps/worker
bun x wrangler d1 create studyos          # paste database_id into wrangler.jsonc
bun x wrangler d1 migrations apply studyos --remote
bun x wrangler secret put SYNC_TOKEN      # any long random string
cd ../pwa && bun run build
cd ../worker && bun run deploy            # serves the app + /sync from one Worker
```

## License

[AGPL-3.0](LICENSE)

---

### Em português

Plataforma de estudos open-source e offline-first: objetivos, trilhas, revisão espaçada
(FSRS), rotinas, timer de foco e conteúdo de fontes gratuitas. Seus dados ficam no seu
dispositivo; a sincronização entre dispositivos é opcional e roda na sua própria conta
gratuita da Cloudflare. Gratuito para sempre.
