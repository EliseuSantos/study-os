# Design

## Shell

One `+layout.svelte` with two chromes, CSS-switched at `lg:` (1024px):

- **Sidebar (≥1024px)**: 236px fixed column, `bg-bg-deep`, hairline right border.
  Top: brand → **profile card** (initials avatar, name from local `profile_name`
  setting, sync state line — the future account slot). Nav grouped under `type-label`
  eyebrows **estudo** (hoje, trilhas, rotina, estudar) · **conteúdo** (biblioteca,
  lembretes) · **progresso** (stats); active item gets the ds selection language (3px
  amber rail + tint, `aria-current="page"`); **hoje carries an amber count badge** of
  due items (lembretes a quiet count). Bottom: install-app + theme toggle (quiet).
  GlobalSearch moves to the main header row.
- **Top bar (<1024px)**: current header unchanged.
- Content: `<main id="conteudo">` with `max-w-[720px]` default measure, `px-8 py-10`
  on desktop (route pages drop their own `mx-auto max-w-2xl` wrappers in favor of a
  shared container class so every screen aligns). Wide screens that need two columns
  (tracks detail, Hoje) use an inner grid, not a wider measure.

## Hoje (dashboard composition — see the published mockup)

Shell grid: sidebar 224px · main (fluid) · rail 264px (`xl:` only; rail stacks into
main below 1280px; main is single column below 1024px).

- Greeting row: h1 `boa noite, <nome>` + meta `qui · 10 de julho · dia N de foco`
  (tabular); GlobalSearch (compact) on the right.
- Quick-create chips row (`quick-create`): + objetivo · + trilha · + card ·
  - lembrete · + importar edital — ghost chips linking to the respective flows.
- Stat tiles (`stat-tile` × 4): **hero tile** (amber tint + border): 'hoje · N a
  rever · ≈ X min · retenção Y%'; constância (dias + 7-day heat strip); horas na
  semana (+delta in --success); dominados (X / Y tópicos). Numbers: display font,
  tabular, ~28px.
- Queue card: `type-label` header + calm replan note inline; **week day-strip**
  (`day-strip`: 7 pills, past days with a green ✓, today solid amber with accent-ink)
  under the header; `today-item` rows keep
  their testids (kind dot: amber ring = revisão, outlined square = bloco, outlined
  circle = lembrete; next item gets 3px amber rail + accent tint); footer CTA row
  'começar revisão · N cards' (primary) + 'estudar sem fila' (ghost).
- Bottom row: week card (7-bar mini chart from netSecondsPerDay, today emphasized,
  meta-da-semana 4px progress bar = existing `target-progress`) · **trilhas em
  andamento** card (per-track progress rows: title · X/Y dominados · % + 4px bar,
  linking to the track).
- Rail: 'revisões em dia' card with the conic amber ring (the focus-timer signature)
  → 'a seguir' list (next dues, next routine occurrence, origin-update note) →
  **objetivos card** (compact list + inline add; `goal-*` testids unchanged) →
  **frase calma card** (amber left rail, Literata italic, rotating brand-voice lines
  like 'a memória consolida dormindo — constância vale mais que intensidade.').
  Empty queue keeps current copy inside the quiet card.
- The `FILA DE HOJE · N ITENS` eyebrow is removed; counts live in the CTA.

## DB-unavailable state

`lib/db/client.ts` already receives `{ kind: 'init-error' }` from the worker — today it
only rejects `getDb()`. Add `lib/stores/db-state.svelte.ts`: module `$state`
`{ status: 'starting' | 'ready' | 'unavailable', reason }`, set by the client promise.
Layout renders a calm banner (`db-unavailable-note`) when unavailable, with copy:
'não deu para abrir o banco local — acesse via https para estudar neste dispositivo.'
(reason `insecure-context` detected via `!window.isSecureContext`; generic copy
otherwise). Stores guard writes on `dbState.status === 'ready'` and forms render
`disabled` — no silent no-ops anywhere.

## Verification approach

Cypress runs at 1180×800 (already the configured viewport) so the sidebar chrome is
what e2e exercises; existing specs keep passing untouched (testids stable). New spec
asserts sidebar nav + db-unavailable banner (banner via a stubbed init-error: visit
with `window.isSecureContext` false is not simulable — instead force the worker error
by intercepting the module? Simplest deterministic hook: a `?e2e-db-fail` query flag
consumed by client.ts in dev/preview builds only... NO — keep it honest: unit-test the
store mapping in bun (client → dbState) and e2e-test only the sidebar/nav/layout.
The banner renders from `dbState`; a tiny Svelte-free bun test covers the mapping.)
