# Lab deploy (homelab `.lan`)

Runs StudyOS on pve-apps (192.168.1.30:8787) behind Nginx Proxy Manager at
**https://study-os.lan** (self-signed cert — HTTPS is required because OPFS/wa-sqlite
only runs in secure contexts; accept the browser warning once per device; service
worker/push stay disabled with an untrusted cert).

```sh
cd .pve && docker compose up -d --build   # on pve-apps
docker logs study-os | grep 'sync token'  # bearer token for this lab instance
lab npm hosts | grep study-os             # proxy entry (host #53, cert #3)
```

- Runtime: `wrangler dev --local` (miniflare) under **Node** — wrangler does not
  support the Bun runtime (bun is only used for install/build in the image).
- D1 state + generated secrets persist in the `study-os-state` volume; optional
  `YOUTUBE_API_KEY` / `FIRECRAWL_API_KEY` via `.pve/.env`.
- This is a lab preview, not the hosted platform (that one deploys to Cloudflare —
  see docs/DEPLOY.md).
