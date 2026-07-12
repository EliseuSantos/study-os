# Tasks

- [ ] 1. Migrations + repos: `questions` (synced, oplog) and `question_attempts`
      (local-only); wire types.
      Verify: `cd packages/db && bun test test/questions.test.ts`
- [ ] 2. Sync spec/table registry: add `questions`, assert `question_attempts` never
      syncs (ping-pong test).
      Verify: `cd packages/db && bun test test/sync.test.ts`
- [ ] 3. Questões card on track detail (CRUD, 1-based UI over 0-based wire, stats
      line, topic filter).
      Verify: `cd apps/pwa && bun x cypress run --spec cypress/e2e/question-bank.cy.ts --browser chromium`
- [ ] 4. Practice route with attempt recording, summary and "criar card disso".
      Verify: same cypress spec (practice scenario)
- [ ] 5. Archive change.
      Verify: `bun x --package=@fission-ai/openspec openspec validate`
