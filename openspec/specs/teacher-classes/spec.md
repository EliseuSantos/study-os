# teacher-classes Specification

## Purpose
TBD - created by archiving change add-teacher-classes. Update Purpose after archive.
## Requirements
### Requirement: Create a class from a track

A teacher SHALL create a turma from the track detail page by giving it a name. The
action publishes the track snapshot through the existing share flow and persists a
`classes` row `{id: uuidv7, track_id, name, share_id, created_at, updated_at,
deleted_at}` (synced table, oplog invariant). The student link is
`/import?share=<share_id>`.

#### Scenario: Teacher creates a turma

- **WHEN** the teacher submits `class-name-input` = "turma A · manhã"
- **THEN** a share is published, a `class-item` appears with `class-share-url`
  containing `/import?share=` and a scannable `class-qr`

### Requirement: Class list is local and deletable

The turmas card SHALL list the teacher's classes for that track. Deleting soft-deletes
the local row only; the share object remains readable. The UI copy states this
explicitly: "o link continua válido para quem já tem — isso só remove a turma da sua
lista.". Empty state: "nenhuma turma ainda — crie a primeira para gerar o link dos
alunos.".

#### Scenario: Delete keeps the share alive

- **WHEN** the teacher clicks `class-delete` on a turma
- **THEN** the `class-item` disappears and `GET /share/:id` still returns the snapshot

### Requirement: Student sees the class on import

WHEN a snapshot carries `class_name`, the import screen SHALL show
`import-class-note` ("você está entrando na turma <name>") and, on confirmation, store
`joined_class = {share_id, name}` as a local-only setting (never synced).

#### Scenario: Joining a class

- **WHEN** a student opens `/import?share=<id>` whose snapshot has `class_name`
- **THEN** `import-class-note` renders the class name before the import button

