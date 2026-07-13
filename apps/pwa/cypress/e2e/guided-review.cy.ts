// guided-review acceptance: the teacher marks focus-of-the-week topics; the
// planner floats them first and the tree shows the chip. Local-only.
describe('guided review loop', () => {
  const stamp = Date.now();
  const trackTitle = `trilha foco ${stamp}`;

  it('marks a focus topic and the planner puts it first on Today', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.location('pathname').then((p) => cy.wrap(p).as('trackPath'));

    for (const title of [`Primeiro ${stamp}`, `Segundo ${stamp}`]) {
      cy.get('[data-testid="topic-open-form"]').click();
      cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(title);
      cy.get('[data-testid="topic-submit"]').click();
    }

    // focus the SECOND topic (position would otherwise pick the first)
    cy.get('[data-testid="topic-item"]')
      .contains(`Segundo ${stamp}`)
      .closest('[data-testid="topic-item"]')
      .find('[data-testid="topic-focus-toggle"]')
      .click({ force: true });
    cy.get('[data-testid="topic-item"]')
      .contains(`Segundo ${stamp}`)
      .closest('[data-testid="topic-item"]')
      .find('[data-testid="focus-chip"]')
      .should('be.visible');

    // a routine today for this track
    cy.visit('/routines');
    cy.get('[data-testid="routine-open-modal"]').click();
    cy.get('[data-testid="routine-title-input"]').type(`bloco foco ${stamp}`);
    const todayDow = new Date().getDay();
    cy.get(`[data-testid="routine-day-${todayDow}"]`).click();
    cy.get('[data-testid="routine-track-select"]').click();
    cy.get('[data-testid="routine-track-select-search"]').type('foco');
    cy.get('[role="option"]').contains(trackTitle).click();
    cy.get('[data-testid="routine-submit"]').click();

    // Today: the planned block for this track carries the focused topic
    cy.visit('/');
    cy.get('[data-testid="today-queue"] [data-testid="today-item"][data-kind="block"]')
      .contains(`Segundo ${stamp}`)
      .should('be.visible');
  });
});
