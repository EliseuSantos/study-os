# Teacher mode: banco de questões com estatística de erro

## Why

Quiz items exist only inside lessons. Teachers building for cohorts need a reusable
bank per track — and the loop only closes when they can see which questions the class
(or the student themself) keeps missing.

## What changes

1. **`questions` table** (synced): `id, track_id, topic_id (nullable), body_md,
   created_at, updated_at, deleted_at`. `body_md` reuses the frozen quiz JSON
   `{"q","options","answer"}` with **0-based** `answer` (UI stays 1-based).
2. **`question_attempts` table** (local-only, like `review_logs` — no `updated_at`,
   never synced): `id, question_id, correct (0/1), attempted_at`.
3. **Track detail "questões" card**: list + create/edit form (question, 2–5 options,
   correct answer select), per-question error rate from local attempts ("errada em
   40% das tentativas · 5 tentativas"), filter by topic.
4. **Practice mode** `/tracks/[id]/practice`: runs the bank (topic-filterable),
   records attempts, ends with a calm summary ("8 de 10 — os erros viram revisão.").
   Wrong answers offer "criar card disso" (front = question, back = correct option).

pt-BR copy: empty bank "nenhuma questão ainda — crie a primeira ou importe de uma
aula."; thin stats "sem tentativas ainda".

data-testids: `qbank-list`, `qbank-item`, `qbank-form`, `qbank-question-input`,
`qbank-option-input`, `qbank-answer-select`, `qbank-stats`, `qbank-delete`,
`practice-start`, `practice-question`, `practice-option`, `practice-summary`,
`practice-make-card`.

## Non-goals

- No import from external question providers.
- No spaced-repetition scheduling of questions (cards remain the SRS unit; the
  "criar card" bridge is the hand-off).
- No class-level question stats in v1 (depends on teacher-progress; local stats only).

## Impact

- `packages/db`: two migrations, repos, oplog wiring for `questions` only.
- `apps/pwa`: questões card, practice route.
- New capability spec `question-bank`. Sync spec delta: `questions` joins the synced
  tables; `question_attempts` explicitly local-only.
