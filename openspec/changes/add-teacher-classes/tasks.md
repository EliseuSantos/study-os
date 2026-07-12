# Tasks

- [ ] 1. Migration `classes` + repo (`createClass`, `listClasses`, `deleteClass`) with
      oplog writes; snapshot builder accepts optional `class_name`.
      Verify: `cd packages/db && bun test test/classes.test.ts`
- [ ] 2. Track detail "turmas" card: create form → publish share → persist class; list
      with link/copy/QR/delete and the calm delete note.
      Verify: `cd apps/pwa && bun x cypress run --spec cypress/e2e/teacher-classes.cy.ts --browser chromium`
- [ ] 3. Import screen: render `import-class-note` when the snapshot carries
      `class_name`; store `joined_class` in settings (local-only).
      Verify: same cypress spec (join scenario)
- [ ] 4. Archive: merge deltas into `openspec/specs/teacher-classes` and
      `track-snapshot`.
      Verify: `bun x --package=@fission-ai/openspec openspec validate`
