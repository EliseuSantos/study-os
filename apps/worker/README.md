# @studyos worker

Cloudflare Worker serving the sync API (`/sync/push`, `/sync/pull`, `/health`), the web
push endpoints, the reminder cron, and the PWA static assets. Thin HTTP shell around
`@studyos/db/sync/server-core`; storage is D1.

## Endpoints

See `docs/SYNC.md` for the frozen wire contract.

- `GET /health` - no auth, `{ "ok": true }`
- `POST /sync/push` - `Authorization: Bearer <SYNC_TOKEN>`, body `PushRequest`
- `GET /sync/pull?since=<ms>&device=<device_id>` - same auth, returns `PullResponse`
- `POST /push/subscribe` - same auth, body `{ device_id, endpoint, p256dh, auth }`,
  upserts into `push_subscriptions` keyed by `device_id`
- `GET /push/vapid` - same auth, returns `{ publicKey }` for `pushManager.subscribe`
- `GET /proxy/youtube/search?q=<query>` - same auth, see "Content proxy"
- `GET /proxy/youtube/transcript?id=<videoId>` - same auth, see "Content proxy"
- `GET /proxy/rss?url=<https url>` - same auth, see "Content proxy"
- `POST /share` - same auth, body a `.studyos.json` snapshot, see "Track sharing"
- `GET /share/:id` - **no auth** (students import via link/QR), see "Track sharing"

## Content proxy

Three bearer-auth'd `GET` endpoints back the M4 content features (`specs/content-connectors.md`),
all served from `src/proxy.ts` and cached with the workerd Cache API (`caches.default`,
behind the `src/cache.ts` seam so bun tests can inject a fake):

- `/proxy/youtube/search?q=` - calls the YouTube Data API v3
  (`search?part=snippet&type=video&maxResults=10`) with the `YOUTUBE_API_KEY` secret and
  maps the result to the frozen wire format
  `{ items: { id, title, channel, thumbnail, duration }[] }`. `duration` is always `null`
  in M4: the search endpoint does not return it and fetching it would cost an extra
  `videos.list` call. Missing secret answers `503 { "error": "youtube api not configured" }`
  so the PWA can hide the source. Cached 6h, keyed by the trimmed lowercase query.
- `/proxy/youtube/transcript?id=` - fetches `https://www.youtube.com/api/timedtext?v=<id>`
  with `lang=pt` then falls back to `lang=en` (YouTube answers 200 with an empty body when
  a track is missing); returns the raw timedtext XML as `text/xml` for the client-side
  `parseTimedText`, or 404 when neither language exists. Cached 24h.
- `/proxy/rss?url=` - fetches the given feed (https only; localhost, private ranges and
  `*.internal` hosts are rejected with 400) with a 5s timeout and passes the body through
  with its original content-type. Upstream failures answer 502. Cached 1h.

`YOUTUBE_API_KEY` is optional: set it in `.dev.vars` locally and with
`bun x wrangler secret put YOUTUBE_API_KEY` in production (an API key restricted to the
YouTube Data API v3 is enough — no OAuth).

### Web search & article reader (Firecrawl)

Two more bearer-auth'd endpoints in `src/firecrawl.ts` back the library's `web` source,
sized for the Firecrawl **free plan** (1,000 credits/month, no rollover):

- `/proxy/firecrawl/search?q=` — `POST /v2/search` with `limit: 10` (2 credits), mapped
  to `{ items: { url, title, description }[] }`. Cached 6h by normalized query.
- `/proxy/firecrawl/scrape?url=` — `POST /v2/scrape` (`formats: ['markdown']`,
  `onlyMainContent`, 1 credit), returns `{ url, title, markdown }` for the in-app
  reader. Same https-only/private-host rules as `/proxy/rss`. Cached **7 days** —
  articles rarely change and every cache hit is a credit saved.

A monthly counter in D1 (`proxy_usage`, migration `0002`) is charged only on real API
calls (cache hits are free) and fails closed: past the ceiling the endpoints answer
`429 { "error": "firecrawl monthly limit reached" }` and the PWA shows a calm note until
the month turns. `FIRECRAWL_API_KEY` is optional (503 without it, source hidden);
`FIRECRAWL_MONTHLY_CREDITS` overrides the default 1000 if you are on a paid plan.

## Track sharing

Teacher mode shares a track as a `.studyos.json` snapshot (`specs/track-snapshot.md`), served
from `src/share.ts` with the `SHARES` R2 bucket (`studyos-shares` in `wrangler.jsonc`):

- `POST /share` (bearer) - body is the raw snapshot JSON, capped at 1 MB (413 above it) and
  validated with `parseSnapshot` from `@studyos/core` (400 `{ "error": "invalid snapshot" }`).
  The worker computes the deterministic FNV-1a content hash (`snapshotHash`, same function
  the PWA uses for update detection), builds the id from the first 10 hex of the hash plus
  4 random hex, gzips the body via `CompressionStream` into R2 at `shares/<id>.json.gz` and
  records `{ id, version_hash, r2_key, title, created_at }` in the D1 `track_shares` table.
  Answers `{ id, hash }`.
- `GET /share/:id` - **public**, no bearer: this is the link/QR students open. Looks the id
  up in `track_shares`, gunzips the R2 object and answers `{ snapshot, hash }`; 404 when
  the id is missing from either store. Cached 1h through the same Cache API seam as the
  content proxy (`src/cache.ts`).

Create the bucket once per account before deploying:

```sh
bun x wrangler r2 bucket create studyos-shares
```

Locally `wrangler dev` emulates R2, nothing to provision. Tests inject `test/fake-r2.ts`
(an in-memory Map with a get counter) as the `SHARES` binding.

## Web push

A cron trigger (`*/5 * * * *`, see `wrangler.jsonc`) runs `src/cron.ts`: if any reminder
came due in the last 5 minutes, every subscription gets a **payload-less** web push
(RFC 8030) signed with a VAPID JWT (RFC 8292, ES256 via WebCrypto). There is no payload
encryption in M3 - the service worker shows a generic notification. Subscriptions that
answer 404/410 are deleted.

Three secrets drive it (exact formats matter):

- `VAPID_PUBLIC_KEY` - the raw **uncompressed P-256 point** (65 bytes, starts with
  `0x04`), base64url-encoded without padding. Sent to browsers as
  `applicationServerKey` and in the `k=` parameter of the `Authorization` header.
- `VAPID_PRIVATE_KEY` - the matching private key as a **JWK JSON string**, e.g.
  `{"kty":"EC","crv":"P-256","d":"...","x":"...","y":"...","ext":true,"key_ops":["sign"]}`
  (`d`/`x`/`y` base64url). Imported with `crypto.subtle.importKey('jwk', ...)`.
- `VAPID_SUBJECT` - contact URI for the push service, `mailto:` or `https:`.

Generate a pair (prints all three lines ready to paste):

```sh
bun run scripts/gen-vapid.ts
```

Locally they live in `.dev.vars`; in production set them with
`bun x wrangler secret put VAPID_PUBLIC_KEY` (and `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

## Local development

```sh
bun run dev            # wrangler dev --port 8787
```

- `SYNC_TOKEN` for local dev comes from `.dev.vars` (gitignored). Copy `.dev.vars.example`
  to `.dev.vars` if it does not exist.
- Apply migrations to the local D1 emulator before first use:

```sh
bun x wrangler d1 migrations apply studyos --local
```

- The `assets.directory` (`../pwa/build`) must exist for `wrangler dev`/`deploy` to start.
  Build the PWA first: `bun x turbo build --filter=pwa`.

## Testing

```sh
bun test               # drives the Hono app against an in-memory bun:sqlite fake D1
```

The fake D1 (`test/fake-d1.ts`) runs the real migration from
`packages/db/migrations/0001_init.sql`, so tests exercise the actual schema and the shared
push/pull SQL builders.

## Deploy

1. Create the database and copy the id it prints into `wrangler.jsonc`
   (`d1_databases[0].database_id` currently holds a placeholder of all zeros):

   ```sh
   bun x wrangler d1 create studyos
   ```

2. Apply migrations remotely:

   ```sh
   bun x wrangler d1 migrations apply studyos --remote
   ```

3. Set the sync token secret:

   ```sh
   bun x wrangler secret put SYNC_TOKEN
   ```

4. Build the PWA (assets are uploaded from `../pwa/build`), then deploy:

   ```sh
   bun x turbo build --filter=pwa
   bun run deploy
   ```
