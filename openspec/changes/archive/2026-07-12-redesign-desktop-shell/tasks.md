# Tasks

- [x] 1. `lib/stores/db-state.svelte.ts` + wire `lib/db/client.ts` init-error into it;
      guard writes in stores; bun test for the mapping.
      Verify: `bun x turbo test --filter=pwa` (new test file) — n/a if pwa has no bun
      tests: cover mapping via a plain ts unit in `apps/pwa/src/lib/stores/__tests__`
      run by vitest? NO — logic-only module goes to `packages/` if needed; keep the
      store thin enough that Cypress + svelte-check suffice.
      Verify: `cd apps/pwa && bun x svelte-check`
- [x] 2. Shell split in `+layout.svelte`: sidebar ≥1024px (nav, search, controls,
      `sidebar`/`sidebar-nav` testids, aria-current), top bar below 1024px, shared
      content container; `db-unavailable-note` banner.
      Verify: `bun x turbo typecheck lint build --filter=pwa`
- [x] 3. Hoje recomposition per spec (greeting, queue protagonist, secondary column,
      eyebrow removed, quiet empty card); forms disabled on db-unavailable.
      Verify: `cd apps/pwa && bun x cypress run --browser chromium --spec cypress/e2e/student-loop.cy.ts,cypress/e2e/planner-loop.cy.ts`
- [x] 4. Container consistency pass on tracks/routines/library/stats/reminders/import
      pages (shared measure, one h1 each).
      Verify: full suite `bun x cypress run --browser chromium` green
- [x] 5. New e2e assertions: sidebar visible at 1180×800 + aria-current; extend
      smoke.cy.ts.
      Verify: `bun x cypress run --browser chromium --spec cypress/e2e/smoke.cy.ts`
- [x] 6. Redeploy lab (`cd .pve && docker compose up -d --build`) and eyeball
      https://study-os.lan.
      Verify: curl SPA 200 + manual look
