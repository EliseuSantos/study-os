# Teacher mode: foco da semana (revisão dirigida)

## Why

A teacher pacing a cohort wants to say "this week, hammer topics X and Y". Students
using imported tracks should feel that nudge inside their own planner — without the
teacher controlling their device.

## What changes

1. **Teacher marks focus topics**: on the track detail (owner side), each topic gets a
   "foco da semana" toggle; the set + an ISO week stamp is stored on the track and
   included in the published snapshot (`focus: {week: "2026-W28", topic_ids: []}`).
   Republish (versioning change) is how it reaches students.
2. **Planner boost**: for tracks whose focus window matches the current ISO week,
   `allocateSchedule`/cycle ordering places focus topics first among unfinished ones
   (dependency order still wins). Pure-core change, unit tested.
3. **Student UI**: focus topics show an amber "foco da semana" chip in the tree and in
   the Hoje queue items derived from them. Stale focus (past week) renders nothing.

pt-BR copy: chip "foco da semana"; teacher hint "marque até 5 tópicos — vale para a
semana atual e vai junto quando você republicar.".

data-testids: `focus-toggle`, `focus-chip`.

## Non-goals

- No remote push of focus without republish (snapshot remains the only channel).
- No per-student overrides or penalties — the planner nudges, never punishes.
- No multi-week scheduling of future focus sets.

## Impact

- `packages/core`: focus-aware ordering in the planner + ISO-week helper.
- `packages/db`: focus set on tracks (synced) + snapshot field.
- `apps/pwa`: toggle (owner), chips (tree + Hoje).
- New capability spec `guided-review`; small delta on `track-snapshot` (focus field).
