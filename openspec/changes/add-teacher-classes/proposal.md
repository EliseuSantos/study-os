# Teacher mode: turmas por link

## Why

Teachers already publish tracks via share links (R2 snapshots), but there is no notion
of a class: no way to name a cohort, hand out one link/QR per group, or see which
shares are "my classes". A turma is the smallest unit every other teacher feature
(progress dashboard, guided review) hangs from.

## What changes

1. **Local `classes` table** (synced, teacher device): `id, track_id, name, share_id,
   created_at, updated_at, deleted_at`. Creating a turma publishes the track snapshot
   (existing share flow) and stores the resulting share id under the class name.
2. **Turmas UI** on the track detail page: card "turmas" listing each class with name,
   student link (`/import?share=<id>`), copy button and QR (existing QR renderer);
   create form (name input + button). Deleting a class only removes the local record
   (the share object stays valid — calm copy explains this).
3. **Student side**: the snapshot payload gains optional `class_name`; the existing
   import screen shows "você está entrando na turma <name>" when present, and records
   `joined_class` (share id + name) in a local-only setting for later features.

pt-BR copy: empty state "nenhuma turma ainda — crie a primeira para gerar o link dos
alunos."; delete note "o link continua válido para quem já tem — isso só remove a
turma da sua lista.".

data-testids: `class-list`, `class-item`, `class-create-form`, `class-name-input`,
`class-create-submit`, `class-share-url`, `class-copy`, `class-qr`, `class-delete`,
`import-class-note`.

## Non-goals

- No accounts, no roster, no server-side list of students (privacy: joining is local).
- No per-student identity anywhere — the progress dashboard change handles aggregates.
- No class chat/announcements.

## Impact

- `packages/db`: migration `classes` + repo + oplog wiring; snapshot payload gains
  `class_name` (optional, backward compatible).
- `apps/pwa`: turmas card on `/tracks/[id]`, import banner.
- `openspec/specs`: new capability `teacher-classes`; delta on `track-snapshot`
  (payload field).
