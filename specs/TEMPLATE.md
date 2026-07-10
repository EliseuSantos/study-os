# <feature name>

status: draft <!-- draft | frozen | implemented -->
owner: <who decides deviations>

## Context

Why this exists — the problem, what prompted it, the intended outcome. One paragraph.

## Requirements

- Numbered, testable statements of behavior ("the queue shows overdue reviews first"),
  not implementation notes.
- Include the non-goals: what this feature deliberately does NOT do.

## Contracts (frozen on approval)

### Types / signatures

```ts
// exact exported types and function signatures, per package
```

### Wire formats / storage

```
// HTTP routes with methods, params, status codes and response shapes;
// new tables/columns/migrations; settings keys; cache keys and TTLs
```

### UI testids

```
component-or-page: testid-one, testid-two, ...
```

pt-BR copy for key states (empty, error, over-limit) written out literally.

## Acceptance criteria

Numbered, each one verifiable by a bun test or a Cypress spec. Name the spec file that
will assert it (e.g. `apps/pwa/cypress/e2e/<slug>-loop.cy.ts`).

## Verification

Commands to run and what must be green (turbo pipeline, specific test files, manual
steps only when automation is impossible — say why).
