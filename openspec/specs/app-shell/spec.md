# app-shell Specification

## Purpose
TBD - created by archiving change redesign-desktop-shell. Update Purpose after archive.
## Requirements
### Requirement: Desktop sidebar shell

At viewports ≥ 1024px the app SHALL render a fixed left sidebar (brand mark + wordmark,
vertical nav with the ds selection language — 3px amber rail + accent tint on the
active item, `aria-current="page"` — plus global search, offline indicator, install and
theme controls). Below 1024px the top-bar chrome remains. Content renders in
`<main id="conteudo">` with a shared container (default measure ~720px); wide screens
compose inner grids instead of widening the measure. All pre-existing `data-testid`s
keep working; new testids: `sidebar`, `sidebar-nav`.

#### Scenario: Wide viewport

- **WHEN** the app renders at 1180×800
- **THEN** `sidebar-nav` is visible with the 7 sections and the current route carries
  `aria-current="page"`

### Requirement: Hoje composition

Hoje SHALL lead with a greeting header (h1 + tabular meta line), the queue as the
visual protagonist (kind dot, title, subtitle per `today-item`; primary
'começar … · N itens' action) and a secondary column (metas, replan note, objetivos).
The redundant `FILA DE HOJE · N ITENS` eyebrow is removed — counts live in the primary
action. Empty queue keeps the copy 'fila zerada. descanse a memória — ela consolida
dormindo.' inside a quiet hairline card.

#### Scenario: Empty queue

- **WHEN** there are no due items
- **THEN** `today-empty` renders inside the quiet card and no eyebrow row exists

### Requirement: DB-unavailable state is explicit

When the local database fails to initialize, the shell SHALL show a calm banner
(`db-unavailable-note`) — copy for insecure contexts: 'não deu para abrir o banco
local — acesse via https para estudar neste dispositivo.' — and every write form SHALL
render disabled. Silent write no-ops are forbidden.

#### Scenario: Insecure origin

- **WHEN** the db worker posts `init-error` (e.g. OPFS unavailable over plain http)
- **THEN** the banner is visible, `goal-submit` is disabled, and no write is attempted

