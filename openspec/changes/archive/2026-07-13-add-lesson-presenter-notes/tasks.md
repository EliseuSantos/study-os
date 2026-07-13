# Tasks

- [x] 1. Migration + repo: `presenter_notes_md` on lesson items (synced, nullable).
      Verify: `cd packages/db && bun test test/lessons.test.ts`
- [x] 2. Snapshot builder strips `presenter_notes_md`; template validator unchanged.
      Verify: `cd packages/core && bun test test/snapshot.test.ts`
- [x] 3. Lesson editor textarea + presenter drawer (`n` toggle) + elapsed timer.
      Verify: `cd apps/pwa && bun x cypress run --spec cypress/e2e/presenter-notes.cy.ts --browser chromium`
- [x] 4. Archive change.
      Verify: `bun x --package=@fission-ai/openspec openspec validate`
