# Teacher mode: painel de progresso agregado (opt-in)

## Why

A teacher who hands out a turma link is blind afterwards: no idea whether the cohort
is moving, or which topic the class is stuck on. StudyOS is local-first, so the only
acceptable answer is an explicit, opt-in, anonymous aggregate — never per-student
tracking.

## What changes

1. **Student opt-in**: on a device that has `joined_class`, settings show "compartilhar
   meu progresso (anônimo) com o professor". When on, the sync cycle also POSTs
   `/class/:shareId/progress` with `{anon_id, topics_done, topics_total, cycle_pct,
   week_minutes}` — `anon_id` is a salted hash of device_id (not reversible), wire
   format frozen in the spec. Off by default; turning it off stops sending (rows expire
   server-side after 30 days without update).
2. **Worker**: D1 table `class_progress (share_id, anon_id, payload, updated_at,
   PRIMARY KEY(share_id, anon_id))`, LWW upsert; `GET /class/:shareId/progress`
   returns aggregates only (count, avg, per-topic done ratio) — never the raw rows —
   and requires the teacher secret issued at publish time.
3. **Teacher dashboard**: `/tracks/[id]` turma card gains "ver progresso da turma" →
   panel with: nº de dispositivos ativos, mediana de tópicos dominados, and a per-topic
   bar list ("% da turma que dominou"). Calm copy for thin data: "poucos alunos
   compartilhando ainda — os números aparecem com 3 ou mais.". K-anonymity floor: the
   worker returns 204 until ≥ 3 anon devices reported.

data-testids: `progress-optin`, `class-progress-open`, `class-progress-panel`,
`class-progress-count`, `class-progress-topic-row`, `class-progress-empty`.

## Non-goals

- No per-student view, names, or timelines — aggregates only, floor of 3 devices.
- No push/nag to students who opted out.
- No history charts in v1 (only the current aggregate).

## Impact

- `apps/worker`: migration `class_progress`, POST/GET routes, teacher secret check,
  k-anonymity floor; tests with FakeD1.
- `packages/db`/`apps/pwa`: opt-in setting (local-only), summary builder, dashboard UI.
- New capability spec `teacher-progress`.
