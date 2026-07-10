# M6 contracts (final milestone — polish & launch)

Full PWA (offline shell, install prompt), mind-map, progress share image, light-theme
a11y pass, deploy docs. DROPPED by user decision mid-milestone: Anki importer and TTS
(both removed from scope and from the tree).

## Stream B — PWA install & offline shell

- `static/sw.js` v2: install → precache `['/', '/manifest.webmanifest']`; fetch handler:
  same-origin GET only — navigations: network-first falling back to cached '/' (offline
  SPA boot); `/_app/immutable/*`: cache-first (hashed, immutable); other same-origin GET
  (fonts, favicon): stale-while-revalidate; NEVER cache `/sync/*`, `/proxy/*`, `/share*`.
  Keep existing push/notificationclick handlers. Version bump constant + old-cache
  cleanup on activate.
- Install prompt: `lib/pwa/install.svelte.ts` captures `beforeinstallprompt`, exposes
  `canInstall`/`promptInstall()`; header button `install-app` ('instalar app') shown only
  when canInstall (calm, text style like theme toggle). iOS: on reminders page, when
  `!window.matchMedia('(display-mode: standalone)')` and iOS UA, show calm hint
  `ios-install-hint` ('no iphone: compartilhar → adicionar à tela de início — necessário
  para notificações.').
- `static/manifest.webmanifest`: add icons — `static/icons/icon.svg` (amber rounded
  square + 'S' glyph? NO glyph fonts — plain amber rounded square per brand mark, solid
  #E9A94F on #191712 tile, maskable) + 192/512 PNGs are REQUIRED by some installers:
  generate two tiny PNGs at build time is overkill — hand-write a script
  `scripts/gen-icons.ts` (bun + no deps: draw via raw PNG encoding is too much — instead
  commit SVG only and set `"icons": [{ "src": "/icons/icon.svg", "sizes": "any",
"type": "image/svg+xml", "purpose": "any maskable" }]`; Chrome accepts SVG; document
  PNG fallback as launch follow-up). display standalone, start_url '/', id '/'.
- `+layout.svelte` edits allowed: install button in header span (keep diff small).

## Stream C — TTS, mind-map, progress image

- Mind-map: `tracks/[id]/MindMap.svelte` — pure SVG horizontal tree (no lib): nodes =
  topics (rounded rect, hairline stroke, title truncated 24ch, status dot color), edges =
  elbow paths; layout: simple tidy-ish algorithm (depth → x column 220px, leaf rows →
  y 44px, parent y = mid of children). Toggle on track page `view-toggle`
  ('árvore ↔ mapa', segmented like mode toggle) swapping tree ↔ `track-mindmap` svg
  (scrollable container). Read-only in M6 (click node selects the topic — reuse existing
  selection state if trivially reachable; else navigation no-op).
- Progress image: on /stats, `share-progress` button ('gerar imagem de progresso') →
  offscreen canvas 1080×1080: bg --bg, brand mark + 'StudyOS', streak huge tabular,
  'N h líquidas · 12 semanas', mini heatmap (12×7 squares from the existing heatmap
  buckets), footer 'estudo local-first · studyos'. Fonts: use loaded document fonts via
  canvas font strings ('600 120px "Space Grotesk"'). Download PNG `progresso.png`
  (`toBlob`). Testid on button; e2e asserts download exists.

## Stream D (after A/B/C) — a11y light pass + launch docs

- Audit: toggle light theme, verify AA on all screens (tokens handle most; fix any
  raw-color or contrast miss found — allowed to touch any pwa file, runs alone).
  Keyboard: full pass Today→tracks→lesson→present (esc/arrows), review (1-4), library.
  Add missing focus-visible rings / aria labels found. Report every fix.
- README: rewrite with badges (CI), feature list, screenshots section (placeholder
  paths + `docs/media/` note), Deploy to Cloudflare button
  (`https://deploy.workers.cloudflare.com/?url=https://github.com/EliseuSantos/study-os`),
  full provisioning walkthrough (d1 create, r2 create, secrets: SYNC_TOKEN, VAPID trio,
  optional YOUTUBE_API_KEY, migrations apply --remote, deploy), PT-BR section mirroring
  the essentials. `docs/DEPLOY.md` with the long-form steps; README links it.
- CI: e2e job uploads `cypress/downloads` artifact too (progress image / ics assertions).

Testids new this milestone: install-app, ios-install-hint, view-toggle, track-mindmap,
share-progress.
Copy pt-BR sentence case; tokens only; no icons/emoji.
