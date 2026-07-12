# question-bank (delta)

## ADDED Requirements

### Requirement: Question CRUD per track

A track SHALL own a bank of questions stored in a synced `questions` table whose
`body_md` is the frozen quiz JSON `{"q": string, "options": string[2..5],
"answer": number}` with 0-based `answer`; every editing UI presents options 1-based.
Questions optionally reference a topic of the same track.

#### Scenario: Creating a question

- **WHEN** the teacher saves `qbank-form` with 4 options and marks option 2 correct
- **THEN** the stored JSON has `"answer": 1` and `qbank-item` lists the question

### Requirement: Local attempt statistics

Practice attempts SHALL be recorded in a local-only `question_attempts` table (never
synced, no `updated_at`). `qbank-stats` shows per-question error rate as
"errada em N% das tentativas · M tentativas"; with zero attempts it shows
"sem tentativas ainda".

#### Scenario: Error rate

- **WHEN** a question has 5 attempts and 2 were wrong
- **THEN** `qbank-stats` reads "errada em 40% das tentativas · 5 tentativas"

### Requirement: Practice mode with a card bridge

`/tracks/[id]/practice` SHALL run the bank (optionally filtered by topic), record one
attempt per answer, and end with `practice-summary` ("8 de 10 — os erros viram
revisão."). Each wrong answer offers `practice-make-card`, creating a card with
front = question text and back = the correct option, via the normal card repo (oplog).

#### Scenario: Wrong answer becomes a card

- **WHEN** the student answers wrong and taps `practice-make-card`
- **THEN** a card exists on the question's topic with the correct option as back
