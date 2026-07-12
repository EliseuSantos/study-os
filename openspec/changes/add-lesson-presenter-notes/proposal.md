# Teacher mode: roteiro do professor na apresentação

## Why

Lessons already have a presentation mode, but a teacher presenting live has no private
script and no sense of elapsed time. Slide notes + a class timer make presentation
mode usable in a real classroom.

## What changes

1. **`presenter_notes_md` on lesson items** (nullable column, synced): the lesson
   editor shows a "roteiro (só você vê)" textarea per item.
2. **Presenter view** in `/present/[lessonId]`: pressing `n` toggles a bottom drawer
   with the current item's notes; a quiet elapsed timer (mm:ss, tabular) sits in the
   corner from the moment the presentation starts. Both are presenter-side only.
3. **Snapshots exclude notes**: the publish/share flow strips `presenter_notes_md`
   so students never receive the script.

pt-BR copy: notes placeholder "roteiro deste slide — visível só na sua apresentação";
empty drawer "sem roteiro para este slide.".

data-testids: `lesson-notes-input`, `presenter-notes`, `presenter-notes-toggle`,
`presenter-timer`.

## Non-goals

- No dual-screen presenter display (single window, drawer overlay).
- No timers per slide or rehearsal statistics.
- No notes on quiz items in v1.

## Impact

- `packages/db`: migration adding `presenter_notes_md` to lesson items + repo update.
- `packages/core`: snapshot builder strips the field (test proves it).
- `apps/pwa`: editor textarea, presenter drawer + timer.
- New capability spec `lesson-presenting`.
