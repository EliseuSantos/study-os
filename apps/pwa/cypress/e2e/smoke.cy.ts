describe('goal smoke test', () => {
  it('loads the today page with the goal form and list', () => {
    cy.visit('/');

    cy.get('[data-testid="goal-form"]').should('be.visible');
    cy.get('[data-testid="goal-list"]').should('exist');
  });

  it('creates a goal and persists it across a reload (OPFS)', () => {
    const title = `Smoke goal ${Date.now()}`;

    cy.visit('/');

    cy.get('[data-testid="goal-title-input"]').type(title);
    cy.get('[data-testid="goal-submit"]').click();

    cy.get('[data-testid="goal-item"]').should('contain.text', title);

    // Reload and confirm the goal survived — this is the critical assertion.
    // It exercises OPFS persistence via the local repo and will fail until
    // that integration is wired up; the spec targets the frozen contract,
    // not the current stub UI.
    cy.reload();

    cy.get('[data-testid="goal-item"]').should('contain.text', title);
  });
});
