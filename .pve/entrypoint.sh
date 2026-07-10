#!/bin/sh
# Lab runtime: wrangler dev --local (miniflare) serving the built PWA + worker API.
# State (D1, generated secrets) persists in the mounted volume at .wrangler/.
set -e

STATE_DIR=/app/apps/worker/.wrangler
SECRETS="$STATE_DIR/lab-secrets.env"

mkdir -p "$STATE_DIR"
if [ ! -f "$SECRETS" ]; then
  echo "generating lab secrets (first boot)"
  SYNC_TOKEN_GEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  bun run scripts/gen-vapid.ts > /tmp/vapid.out
  VAPID_PUBLIC_KEY=$(grep '^VAPID_PUBLIC_KEY=' /tmp/vapid.out | cut -d= -f2-)
  VAPID_PRIVATE_KEY=$(grep '^VAPID_PRIVATE_KEY=' /tmp/vapid.out | cut -d= -f2-)
  VAPID_SUBJECT='mailto:lab@study-os.lan'
  {
    echo "SYNC_TOKEN=${SYNC_TOKEN:-$SYNC_TOKEN_GEN}"
    echo "VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY"
    echo "VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY"
    echo "VAPID_SUBJECT=$VAPID_SUBJECT"
  } > "$SECRETS"
fi

cp "$SECRETS" .dev.vars
if [ -n "$YOUTUBE_API_KEY" ]; then echo "YOUTUBE_API_KEY=$YOUTUBE_API_KEY" >> .dev.vars; fi
if [ -n "$FIRECRAWL_API_KEY" ]; then echo "FIRECRAWL_API_KEY=$FIRECRAWL_API_KEY" >> .dev.vars; fi

echo "sync token: $(grep '^SYNC_TOKEN=' .dev.vars | cut -d= -f2)"
npx wrangler d1 migrations apply studyos --local
exec npx wrangler dev --ip 0.0.0.0 --port 8787
