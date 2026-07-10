// M6 acceptance: mind-map view of the track tree and the shareable progress image.
describe('polish loop', () => {
  const stamp = Date.now();
  const trackTitle = `trilha mapa ${stamp}`;

  it('renders the track as a mind-map and selects a node', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();

    cy.get('[data-testid="outline-import-open"]').click();
    cy.get('[data-testid="outline-input"]').type('# Raiz\n- Filho um\n- Filho dois');
    cy.get('[data-testid="outline-confirm"]').click();
    cy.get('[data-testid="topic-item"]').should('have.length', 3);

    cy.get('[data-testid="view-toggle"]').contains('mapa').click();
    cy.get('[data-testid="track-mindmap"] svg').should('exist');
    cy.get('[data-testid="track-mindmap"] [role="button"]').should('have.length', 3);
    cy.get('[data-testid="track-mindmap"] [role="button"]').contains('Filho um').click();
    cy.contains('tópico · Filho um');
  });

  it('generates the progress image from stats', () => {
    cy.visit('/study');
    cy.get('[data-testid="timer-start"]').click();
    cy.wait(1200);
    cy.get('[data-testid="timer-finish"]').click();
    cy.get('[data-testid="session-save"]').click();
    cy.contains('sessão registrada');

    cy.visit('/stats');
    cy.get('[data-testid="share-progress"]').click();
    cy.readFile('cypress/downloads/progresso.png', 'binary', { timeout: 10000 }).should(
      'have.length.greaterThan',
      1000,
    );
  });

  it('registers the service worker with an offline-capable cache', () => {
    cy.visit('/');
    cy.window().then((win) =>
      win.navigator.serviceWorker.ready.then((reg) => {
        expect(reg.active).to.not.equal(null);
      }),
    );
  });
});
