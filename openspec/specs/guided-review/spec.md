# guided-review Specification

## Purpose
TBD - created by archiving change add-guided-review. Update Purpose after archive.
## Requirements
### Requirement: Teacher marks weekly focus topics

The track owner SHALL toggle up to 5 topics as "foco da semana" (`focus-toggle`). The
set is stored as `{focus_week: ISO week string, focus_topic_ids: string[≤5]}` on the
track (synced) and included in published snapshots. The teacher hint reads "marque até
5 tópicos — vale para a semana atual e vai junto quando você republicar.".

#### Scenario: Cap at five

- **WHEN** 5 topics are already marked and the owner toggles a sixth
- **THEN** the toggle is refused with no state change

### Requirement: Planner places focus topics first

WHEN a track's `focus_week` equals the current ISO week, unfinished focus topics SHALL
be ordered before other unfinished topics in schedule allocation and cycle ordering —
dependency order still takes precedence. A stale `focus_week` has no effect.

#### Scenario: Focus beats position, not deps

- **WHEN** topic B (position 5, focus) and topic A (position 1, not focus) are both
  unfinished and independent
- **THEN** the next allocated block picks B

### Requirement: Focus chips for students

Topics under an active focus week SHALL render an amber `focus-chip` ("foco da
semana") in the topic tree and on Hoje queue items derived from them; nothing renders
when the week has passed.

#### Scenario: Stale focus is silent

- **WHEN** the focus week is last week
- **THEN** no `focus-chip` is rendered anywhere

