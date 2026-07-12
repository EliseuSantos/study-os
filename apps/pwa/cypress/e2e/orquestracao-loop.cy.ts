// M10 acceptance: first-touch "why" notes dismiss forever; a dated goal linked
// to a track shows the exam countdown; rated cards project review load on the
// agenda. Local-only (no network).
describe('orquestracao e orientacao loop', () => {
  const stamp = Date.now();
  const trackTitle = `trilha prova ${stamp}`;

  it('shows a why note once and never again after "entendi"', () => {
    cy.visit('/review');
    cy.get('[data-testid="why-note"][data-flag="review"]').should('be.visible');
    cy.get('[data-testid="why-note"][data-flag="review"] [data-testid="why-dismiss"]').click();
    cy.get('[data-testid="why-note"][data-flag="review"]').should('not.exist');
    cy.reload();
    cy.get('[data-testid="why-note"][data-flag="review"]').should('not.exist');
  });

  it('links a dated goal to a track and shows the exam countdown', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();

    const target = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    cy.visit('/goals');
    cy.get('[data-testid="goal-open-modal"]').click();
    cy.get('[data-testid="goal-title-input"]').type(`prova ${stamp}`);
    cy.get('[data-testid="goal-date-input"]').type(target);
    cy.get('[data-testid="goal-track-select"]').click();
    cy.get('[data-testid="goal-track-select-search"]').type('prova');
    cy.get('[role="option"]').contains(trackTitle).click();
    cy.get('[data-testid="goal-submit"]').click();

    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="exam-countdown"]').contains(/prova em (39|40|41) dias/);
  });

  it('projects rated cards as review load on the agenda', () => {
    // a rated card gets a due date inside the week → the forecast marker appears
    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`T ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();
    cy.get('[data-testid="topic-title"]').contains(`T ${stamp}`).click();
    cy.get('[data-testid="card-form-toggle"]').click();
    cy.get('[data-testid="card-front-input"]').type(`carga ${stamp}?`);
    cy.get('[data-testid="card-submit"]').click();

    cy.visit('/review');
    cy.get('[data-testid="review-reveal"]').click();
    cy.get('[data-testid="rating-3"]').click();

    cy.visit('/routines');
    cy.get('[data-testid="forecast-day"]').should('exist');
  });
});
