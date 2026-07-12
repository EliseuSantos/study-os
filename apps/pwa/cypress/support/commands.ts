// Custom Cypress commands go here. Empty scaffold for now.
export {};

// The shell prerenders: static HTML paints before hydration, and clicking a
// pre-hydration button is a no-op. Gate every visit/reload on the marker the
// root layout sets in onMount.
Cypress.Commands.overwrite('visit', function visitHydrated(orig, ...args) {
  // @ts-expect-error — overwrite passthrough keeps cypress' own overloads
  const chain = orig(...args);
  return chain.then(() => {
    cy.get('html[data-hydrated]', { timeout: 20_000 }).should('exist');
  });
});

Cypress.Commands.overwrite('reload', function reloadHydrated(orig, ...args) {
  // @ts-expect-error — overwrite passthrough keeps cypress' own overloads
  const chain = orig(...args);
  return chain.then(() => {
    cy.get('html[data-hydrated]', { timeout: 20_000 }).should('exist');
  });
});
