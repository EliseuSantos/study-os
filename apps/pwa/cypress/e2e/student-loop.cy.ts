// M2 acceptance: import an outline, manage topics, create a card, review it via
// Today. Everything offline — no worker needed.
describe('student core loop', () => {
  const stamp = Date.now();
  const trackTitle = `edital ${stamp}`;
  const cardFront = `o que é controle de constitucionalidade? ${stamp}`;

  it('imports an outline into a topic tree', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();

    cy.get('[data-testid="outline-import-open"]').click();
    cy.get('[data-testid="outline-input"]').type(
      [
        '# Direito constitucional',
        '- Princípios fundamentais',
        '- Controle de constitucionalidade',
        '# Português',
        '- Concordância verbal',
      ].join('\n'),
    );
    cy.get('[data-testid="outline-preview-item"]').should('have.length', 5);
    cy.get('[data-testid="outline-confirm"]').click();

    cy.get('[data-testid="topic-tree"] [data-testid="topic-item"]').should('have.length', 5);
    cy.get('[data-testid="topic-title"]').contains('Controle de constitucionalidade');
  });

  it('cycles topic status and creates a card', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();

    cy.get('[data-testid="topic-item"]')
      .contains('Princípios fundamentais')
      .closest('[data-testid="topic-item"]')
      .find('[data-testid="topic-status-toggle"]')
      .as('toggle');
    cy.get('@toggle').click();
    // the tree re-renders on status change — re-query, an alias would go stale
    cy.get('[data-testid="topic-item"]')
      .contains('Princípios fundamentais')
      .closest('[data-testid="topic-item"]')
      .find('[data-testid="topic-status-toggle"]')
      .should('have.attr', 'aria-label')
      .and('include', 'estudando');

    cy.get('[data-testid="topic-title"]').contains('Controle de constitucionalidade').click();
    cy.get('[data-testid="card-form-toggle"]').click();
    cy.get('[data-testid="card-front-input"]').type(cardFront);
    cy.get('[data-testid="card-back-input"]').type(
      'exame da compatibilidade das normas com a constituição',
    );
    cy.get('[data-testid="card-submit"]').click();
    cy.get('[data-testid="card-item"]').contains(cardFront);
  });

  it('reviews the new card from the Today queue', () => {
    cy.visit('/');
    cy.get('[data-testid="today-queue"]')
      .invoke('text')
      .then((t) => cy.log(`FILA: ${t.slice(0, 400)}`));
    cy.get('[data-testid="today-queue"] [data-testid="today-item"]').contains(cardFront);
    cy.get('[data-testid="start-next"]').click();

    cy.location('pathname').should('eq', '/review');
    cy.get('[data-testid="review-front"]').should('be.visible');
    cy.get('[data-testid="review-reveal"]').click();
    cy.get('[data-testid="review-back"]').should('be.visible');

    // rate everything in the queue with "bom"
    function rateAll(): void {
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="rating-3"]').length > 0) {
          cy.get('[data-testid="rating-3"]').click();
          cy.get('body').then(($b) => {
            if ($b.find('[data-testid="review-reveal"]:visible').length > 0) {
              cy.get('[data-testid="review-reveal"]').click();
            }
          });
          rateAll();
        }
      });
    }
    rateAll();

    cy.get('[data-testid="review-empty"]').should('be.visible');
    cy.contains('voltar ao hoje').click();
    // other specs may have seeded routine blocks/reminders in the shared OPFS db,
    // so assert only that no review items remain
    cy.get('[data-testid="today-item"][data-kind="review"]').should('not.exist');
  });

  it('runs a study session with the net-hours timer', () => {
    cy.visit('/study');
    cy.get('[data-testid="timer-start"]').click();
    cy.get('[data-testid="study-timer"]').should('contain', '00:0');
    cy.wait(2100);
    cy.get('[data-testid="timer-pause"]').click();
    cy.get('[data-testid="timer-resume"]').click();
    cy.get('[data-testid="timer-finish"]').click();
    cy.get('[data-testid="session-form"]').should('be.visible');
    cy.get('[data-testid="session-notes"]').type('primeira sessão');
    cy.get('[data-testid="session-save"]').click();
    cy.contains('sessão registrada');
  });
});
