describe('goal smoke test', () => {
  it('loads the goals page with list and modal', () => {
    cy.visit('/goals');

    cy.get('[data-testid="goal-list"]').should('exist');
    cy.get('[data-testid="goal-open-modal"]').click();
    cy.get('[data-testid="goal-form"]').should('be.visible');
  });

  it('creates a goal and persists it across a reload (OPFS)', () => {
    const title = `Smoke goal ${Date.now()}`;

    cy.visit('/goals');
    cy.get('[data-testid="goal-open-modal"]').click();
    cy.get('[data-testid="goal-title-input"]').type(title);
    cy.get('[data-testid="goal-submit"]').click();

    cy.get('[data-testid="goal-item"]').should('contain.text', title);

    // Reload and confirm the goal survived — the critical OPFS assertion.
    cy.reload();

    cy.get('[data-testid="goal-item"]').should('contain.text', title);
  });
});
