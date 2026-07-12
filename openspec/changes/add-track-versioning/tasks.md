# Tasks

- [ ] 1. Core: `version` in snapshot build/parse (default 1) + pure merge function
      (keep status/cards on matching ids, soft-delete removed, add new as pending).
      Verify: `cd packages/core && bun test test/snapshot-merge.test.ts`
- [ ] 2. Db: store origin `version` on import; merge executor writing through repos
      (oplog invariant, one batch).
      Verify: `cd packages/db && bun test test/track-merge.test.ts`
- [ ] 3. PWA: version check against origin share (cached), banner + apply + dismiss.
      Verify: `cd apps/pwa && bun x cypress run --spec cypress/e2e/track-versioning.cy.ts --browser chromium`
- [ ] 4. Archive: merge delta into `openspec/specs/track-snapshot`.
      Verify: `bun x --package=@fission-ai/openspec openspec validate`
