# Tasks

- [ ] 1. Core: ISO-week helper + focus-first ordering in planner (deps still first).
      Verify: `cd packages/core && bun test test/planner-focus.test.ts`
- [ ] 2. Db: `focus_week`/`focus_topic_ids` on tracks (synced) + snapshot field
      build/parse.
      Verify: `cd packages/db && bun test test/tracks.test.ts`
- [ ] 3. PWA: owner toggle (max 5, hint copy) + chips in tree and Hoje queue; stale
      week renders nothing.
      Verify: `cd apps/pwa && bun x cypress run --spec cypress/e2e/guided-review.cy.ts --browser chromium`
- [ ] 4. Archive: merge into `guided-review` + `track-snapshot` deltas.
      Verify: `bun x --package=@fission-ai/openspec openspec validate`
