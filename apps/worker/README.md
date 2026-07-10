# @studyos worker

Cloudflare Worker serving the sync API (`/sync/push`, `/sync/pull`, `/health`) and the PWA
static assets. Thin HTTP shell around `@studyos/db/sync/server-core`; storage is D1.

## Endpoints

See `docs/SYNC.md` for the frozen wire contract.

- `GET /health` - no auth, `{ "ok": true }`
- `POST /sync/push` - `Authorization: Bearer <SYNC_TOKEN>`, body `PushRequest`
- `GET /sync/pull?since=<ms>&device=<device_id>` - same auth, returns `PullResponse`

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
