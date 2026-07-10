# Deploy your own StudyOS

Complete walkthrough from zero to a running instance on Cloudflare's free tier. One
Worker serves everything: the PWA (static assets), the sync API, web push, the content
proxy and track sharing. No other infrastructure.

Prefer one click? The
[Deploy to Cloudflare button](https://deploy.workers.cloudflare.com/?url=https://github.com/EliseuSantos/study-os)
in the README forks the repo and provisions the Worker for you — you still need to set
the secrets (step 4) afterwards.

## 0. Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) — the free plan is enough.
- [Bun](https://bun.sh) ≥ 1.3.
- Log wrangler into your account (wrangler itself comes with the repo's dependencies):

```sh
git clone https://github.com/EliseuSantos/study-os.git
cd study-os
bun install
cd apps/worker
bun x wrangler login
```

All remaining commands run from `apps/worker` unless noted.

## 1. Create the D1 database

```sh
bun x wrangler d1 create studyos
```

Copy the `database_id` it prints into `apps/worker/wrangler.jsonc` at
`d1_databases[0].database_id` (it ships with an all-zeros placeholder).

## 2. Create the R2 bucket (track sharing)

```sh
bun x wrangler r2 bucket create studyos-shares
```

The name must match `r2_buckets[0].bucket_name` in `wrangler.jsonc` (`studyos-shares`
by default). Shared tracks are stored here as gzipped `.studyos.json` snapshots.

## 3. Apply migrations

```sh
bun x wrangler d1 migrations apply studyos --remote
```

Migrations live in `packages/db/migrations/` and are the same schema the PWA runs
locally over OPFS.

## 4. Set the secrets

### SYNC_TOKEN (required for sync)

Any long random string — it is the single bearer token protecting `/sync/*`, `/push/*`,
`/proxy/*` and `POST /share`:

```sh
openssl rand -hex 32   # or any other generator
bun x wrangler secret put SYNC_TOKEN
```

### VAPID trio (required for web push reminders)

Generate a key pair in the exact formats the Worker expects:

```sh
bun run scripts/gen-vapid.ts
```

It prints three ready-to-paste values; set each one:

```sh
bun x wrangler secret put VAPID_PUBLIC_KEY    # base64url uncompressed P-256 point
bun x wrangler secret put VAPID_PRIVATE_KEY   # JWK JSON string
bun x wrangler secret put VAPID_SUBJECT       # mailto: or https: contact URI
```

Skip these if you do not care about push notifications — everything else still works.

### YOUTUBE_API_KEY (optional)

Enables YouTube search in the library. A plain API key restricted to the YouTube Data
API v3 is enough (no OAuth):

```sh
bun x wrangler secret put YOUTUBE_API_KEY
```

Without it the Worker answers `503 { "error": "youtube api not configured" }` and the
PWA hides the YouTube source. Wikipedia and Stack Exchange work with no key.

## 5. Build and deploy

The Worker uploads the PWA build as its static assets, so build the app first (from the
repo root), then deploy:

```sh
cd ../..
bun x turbo build --filter=pwa
cd apps/worker
bun run deploy
```

Wrangler prints your `https://studyos.<subdomain>.workers.dev` URL. Open it — the app
is fully usable offline-first from the first load, with zero configuration.

## 6. Connect the PWA to sync

Sync is opt-in per device. The app reads the bearer token from the `sync_token` key of
its **local** `settings` table (device-local, never synced — see
[SYNC.md](./SYNC.md)); until it is set, the footer shows "local apenas · sync não
configurado" and all data stays on-device.

Current limitation (single-user M1 model): there is no settings screen yet, so setting
`sync_token` on a device is manual — a proper settings UI is a launch follow-up. In
local development the token falls back to `dev-token` automatically, matching
`.dev.vars.example`.

## Cron and push notes

- The cron trigger (`*/5 * * * *` in `wrangler.jsonc`) checks for reminders due in the
  last 5 minutes and sends a **payload-less** web push to every subscription; the
  service worker shows a generic notification. Notification content never leaves the
  device.
- Push requires the site to be installed as a PWA on iOS (share → add to home screen);
  the reminders page shows this hint on iPhones.
- Subscriptions answering 404/410 are deleted automatically.

## Free-tier notes

Everything fits Cloudflare's free plan; StudyOS is deliberately frugal with it:

- **Workers**: one Worker serves app + API, so one request budget and no CORS
  preflights. Sync is single-flight with exponential backoff and only fires when there
  are unsent ops.
- **D1**: sync mirror + share index. Sync batches up to 500 ops per request.
- **R2**: gzipped share snapshots, capped at 1 MB each before compression.
- **Cron**: a single `*/5` schedule.
- **Cache API**: proxy responses cached at the edge (YouTube search 6 h, transcripts
  24 h, RSS 1 h, public shares 1 h) so upstream quotas and D1/R2 reads stay low.

## Troubleshooting

- **Sync answers 401 unauthorized** — the device token does not match `SYNC_TOKEN`.
  Re-check the secret (`bun x wrangler secret put SYNC_TOKEN`) and the device's
  `sync_token` setting. The status line on the home page shows "não sincronizou —
  tenta de novo sozinho" while it retries.
- **Push stopped for a device** — the push service answered 404/410 for its
  subscription and the Worker deleted it (this is the normal cleanup path).
  Re-enable push on that device from the reminders page.
- **YouTube search answers 503** — `YOUTUBE_API_KEY` is not set (see step 4); the
  library hides the YouTube source in that case.
- **`wrangler dev`/`deploy` fails about a missing assets directory** — the PWA build
  must exist first: `bun x turbo build --filter=pwa` from the repo root.
- **Migrations error about the database id** — `database_id` in `wrangler.jsonc` still
  holds the all-zeros placeholder from step 1.
