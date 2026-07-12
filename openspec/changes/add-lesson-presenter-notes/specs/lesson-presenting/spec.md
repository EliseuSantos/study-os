# lesson-presenting (delta)

## ADDED Requirements

### Requirement: Private presenter notes per lesson item

Lesson items SHALL carry an optional `presenter_notes_md` (markdown, synced like the
rest of the row). The lesson editor exposes `lesson-notes-input` with placeholder
"roteiro deste slide — visível só na sua apresentação". Published snapshots MUST NOT
contain the field.

#### Scenario: Notes never reach students

- **WHEN** a lesson with notes is published as a snapshot
- **THEN** the snapshot JSON has no `presenter_notes_md` key on any item

### Requirement: Presenter drawer and elapsed timer

In presentation mode, pressing `n` (or `presenter-notes-toggle`) SHALL toggle a drawer
showing the current item's notes ("sem roteiro para este slide." when empty), and
`presenter-timer` SHALL show elapsed mm:ss (tabular numerals) since the presentation
opened.

#### Scenario: Toggling notes

- **WHEN** the presenter presses `n` on a slide with notes
- **THEN** `presenter-notes` renders the markdown; pressing `n` again hides it
