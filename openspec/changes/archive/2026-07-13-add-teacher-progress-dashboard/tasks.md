# Tasks

- [x] 1. Worker: migration + `POST/GET /class/:shareId/progress` (LWW upsert, teacher
      secret, k=3 floor, aggregates only).
      Verify: `cd apps/worker && bun test test/class-progress.test.ts`
- [x] 2. Student opt-in setting + summary builder + send-on-sync (off by default,
      salted anon_id).
      Verify: `cd packages/db && bun test test/class-progress-summary.test.ts`
- [x] 3. Teacher dashboard panel on the turma card (count, median, per-topic bars,
      empty copy).
      Verify: `cd apps/pwa && bun x cypress run --spec cypress/e2e/teacher-progress.cy.ts --browser chromium`
- [x] 4. Docs (SYNC.md privacy note) + archive.
      Verify: `bun x --package=@fission-ai/openspec openspec validate`
