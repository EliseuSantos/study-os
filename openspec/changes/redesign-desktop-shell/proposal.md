# Redesign: desktop shell & elegance pass

## Why

On wide screens the app renders as a narrow centered column with a top nav — a mobile
layout stretched to desktop. The owner's verdict on the current Hoje screen: layout
horrível. Concretely:

- The design system itself prescribes a different desktop shell (`packages/design/readme.md`,
  "Desktop app (1180px) — **sidebar nav replaces the tab bar**; Trilha shows tree +
  topic detail side by side") — the current top-nav ribbon ignores it.
- Vast dead space left/right of a 672px column at 1440px+; header items float oddly.
- Redundant hierarchy on Hoje: eyebrow `FILA DE HOJE · 0 ITENS` immediately above an h1
  that repeats "fila de hoje"; goals form dominates visually over the actual queue.
- **Silent failure**: when the local DB cannot initialize (e.g. plain-http origin →
  OPFS unavailable), every form (criar objetivo, etc.) fails with no feedback at all.
  The calm brand voice requires an explicit, non-alarmist explanation instead.

## What changes

1. **Desktop shell (≥1024px)**: fixed left sidebar — brand mark, nav (hoje, trilhas,
   rotina, estudar, biblioteca, lembretes, stats), global search, install/theme/offline
   affordances at the bottom. Content area gets a proper reading measure with real
   margins. Below 1024px the current top header remains (single column).
2. **Hoje recomposed as a dashboard** (owner-supplied references: sidebar EdTech
   dashboards — greeting, stat tiles, card sections, right rail): greeting header +
   tabular meta; a row of 3 stat tiles (constância with 7-day mini heat strip, horas na
   semana with delta, retenção/a-rever); the queue as a card with amber-rail next item
   and the primary 'começar · N' action; a bottom row with the week mini bar chart +
   meta progress and the objetivos card; a right rail (≥1280px) with the conic amber
   progress ring (the brand's timer signature reused) and an 'a seguir' list. Sidebar
   bottom carries the profile slot (initials avatar, name, sync state) — ready to
   receive hosted-platform accounts later. Mockup: claude.ai artifact
   'mockup-shell' (v1-shell-desktop).
3. **DB-unavailable state**: when the db worker fails to initialize, the shell shows a
   calm banner ('não deu para abrir o banco local — acesse via https para estudar
   neste dispositivo.') and write forms disable; no silent no-ops.
4. Consistency pass on the other screens' containers (same measure/margins, one h1 per
   page, eyebrows only where they add information).

## Non-goals

- Login/accounts (hosted-platform auth is its own future change).
- Mobile redesign (the tab-bar mobile shell from the ds is a later change; small
  screens keep the current single column).
- New features, new tokens, new dependencies — tokens and glyph rules stay as-is.

## Impact

`apps/pwa/src/routes/+layout.svelte` (shell split), `routes/+page.svelte` (Hoje),
`lib/components/GlobalSearch.svelte` (placement), `lib/db/client.ts` +
`lib/stores/db-state.svelte.ts` (new, init-error surfacing), container classes across
route pages. All existing `data-testid`s preserved; e2e suite must stay green.
