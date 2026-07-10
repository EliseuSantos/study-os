# Specs — spec-driven development

Every non-trivial feature starts here, **before code**. A spec is the frozen contract
that parallel work (humans or agents) codes against, and the checklist the result is
verified against. This replaces the per-milestone `docs/M*-CONTRACTS.md` files used
during the initial build (their durable contracts were migrated into the specs below).

## Workflow

1. **Draft** — copy [TEMPLATE.md](TEMPLATE.md) to `specs/<feature-slug>.md`, fill in
   context, requirements, contracts (types/signatures/wire formats/testids) and the
   acceptance criteria. Status: `draft`.
2. **Freeze** — once approved, set status `frozen`. From this point the contracts are
   the source of truth: implementations must match them exactly; needed deviations are
   edited into the spec first (and called out in review).
3. **Implement** — code against the spec. UI work uses the spec's `data-testid`s;
   API work uses the spec's wire formats; e2e specs in `apps/pwa/cypress/e2e/` assert
   the acceptance criteria.
4. **Verify & land** — the PR links the spec; status becomes `implemented`. The spec
   stays as living documentation of the contract (update it when the contract evolves —
   it is not an archive).

## Conventions that apply to every spec

- Everything in English except UI copy (pt-BR, sentence case, calm tone, `·` separator).
- DB access only through `packages/db` repos; every synced-table write goes through the
  oplog invariant (`localWrite`); wire payloads are full rows.
- Styling only via `@studyos/design` tokens; no icons/emoji (geometric glyphs only).
- Tests: `bun test` where the logic lives; Cypress (Chromium) for user-visible loops,
  written against the spec's testids with network fully intercepted.
- Free-tier discipline: cache aggressively, budget external APIs, fail closed with calm
  UI notes.

## Current specs

| Spec                                        | Status      | Covers                                                                             |
| ------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| [sync-protocol](../docs/SYNC.md)            | implemented | LWW oplog sync wire contract (lives in docs/, predates specs/)                     |
| [content-connectors](content-connectors.md) | implemented | Connector interface, proxy wire formats (YouTube, Firecrawl, RSS), library testids |
| [track-snapshot](track-snapshot.md)         | implemented | `.studyos.json` format, content hash, share API, quiz item encoding                |
