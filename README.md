# StudyOS

[![ci](https://github.com/EliseuSantos/study-os/actions/workflows/ci.yml/badge.svg)](https://github.com/EliseuSantos/study-os/actions/workflows/ci.yml)
[![license: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

Open-source, offline-first study platform (pt-BR) for exam candidates and their
teachers. Paste a syllabus and it becomes a study track; a daily queue, an FSRS
spaced-repetition scheduler, a focus timer and honest stats keep the studying going —
all on your device, working fully offline. The hosted platform adds optional
multi-device sync, web push reminders and track sharing. No tracking, free forever.

## Features

**For students**

- Goals and study tracks ("trilhas") — paste a syllabus ("edital") and import it as a
  topic tree, or build one by hand; tree and mind-map views
- Daily queue ("hoje") with schedule or study-cycle planning per track
- FSRS-5 spaced-repetition flashcards, reviewed with keyboard shortcuts
- Focus timer ("horas líquidas") with session types, pauses and a session checklist
- Weekly routines and a planner that redistributes what slipped — never punishes
- Stats: study heatmap, streak, accuracy per track, weak points, shareable progress
  image
- Library: search YouTube, Wikipedia, Stack Exchange and the web (Firecrawl,
  optional — free tier respected), attach content to topics, watch videos with a
  synced transcript, read articles in a clean in-app reader
- Reminders with local notifications, web push and `.ics` export
- Installable PWA with a full offline shell

**For teachers**

- Lessons composed from topics, content, notes and live quizzes
- Presentation mode: fullscreen slides, presenter view (timer, notes, next-up),
  keyboard and tap navigation
- Share a track as a link + QR code, or export/import `.studyos.json` files —
  students import with one tap and get notified when the shared version moves on
- Ready-made track templates (`templates/`)

## Local-first architecture

All data lives in an on-device SQLite database (wa-sqlite over OPFS); the app is fully
functional with zero cloud configured. Every local write appends to an oplog in the
same transaction, and an optional Worker mirrors it to D1 with last-write-wins sync —
the same Worker serves the app itself, the content proxy and shared tracks. Details in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SYNC.md](docs/SYNC.md).

Stack: Bun · Turborepo · SvelteKit (Svelte 5) · Tailwind v4 · wa-sqlite (OPFS) · Hono ·
Cloudflare Workers + D1 + R2 · oxlint · bun test · Cypress.

## Screenshots

_Screenshots and a short gif land in `docs/media/` before the announce._

## Quickstart (development)

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

## License

[AGPL-3.0](LICENSE)

---

### Em português

Plataforma de estudos open-source e offline-first para concurseiros e professores.
Cole um edital e ele vira uma trilha de estudo: fila diária, revisão espaçada (FSRS),
timer de foco, rotinas, estatísticas e biblioteca de conteúdo gratuito — tudo no seu
dispositivo, funcionando offline. Professores montam aulas, apresentam com modo
apresentador e quiz ao vivo, e compartilham trilhas por link e QR code.

Seus dados ficam no seu aparelho (SQLite sobre OPFS) e o app funciona 100% offline.
A plataforma online adiciona sincronização entre dispositivos, push de lembretes e
compartilhamento — sem rastreamento, gratuito para sempre.
