// track-versioning acceptance against the real ephemeral worker: publish,
// import, republish IN PLACE (same id), and merge the update keeping progress.
describe('track versioning loop', () => {
  const stamp = Date.now();
  const trackTitle = `edital vivo ${stamp}`;

  it('publishes, imports, republishes and merges keeping progress', () => {
    // share/import hit the real worker — authedFetch needs the token stored
    cy.visit('/settings');
    cy.get('[data-testid="settings-sync-token"]').type('dev-token');
    cy.get('[data-testid="settings-sync-token-save"]').click();
    cy.get('[data-testid="toast"]').contains('token salvo');

    // ---- teacher: track with one topic, published ----
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.location('pathname').then((p) => cy.wrap(p).as('teacherTrack'));
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`Base ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();

    cy.get('[data-testid="share-track"]').click();
    cy.get('[data-testid="share-url"]')
      .invoke('val')
      .then((url) => {
        const shareId = String(url).split('share=')[1];
        expect(shareId).to.have.length.greaterThan(5);
        cy.wrap(shareId).as('shareId');
      });
    // publishing once flips the button into republish mode
    cy.get('[data-testid="share-track"]').contains('republicar');

    // ---- student: import and make progress ----
    cy.get<string>('@shareId').then((shareId) => {
      cy.visit(`/import?share=${shareId}`);
    });
    cy.get('[data-testid="import-confirm"]').click();
    cy.location('pathname').should('match', /^\/tracks\/.+/);
    cy.location('pathname').then((p) => cy.wrap(p).as('studentTrack'));
    cy.get('[data-testid="topic-item"]')
      .contains(`Base ${stamp}`)
      .closest('[data-testid="topic-item"]')
      .find('[data-testid="topic-status-toggle"]')
      .click();

    // ---- teacher: adds a topic and republishes the SAME link ----
    // (the imported copy shares the title — go back by URL, not by list text)
    cy.get<string>('@teacherTrack').then((path) => cy.visit(path));
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`Extra ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();
    cy.get('[data-testid="share-track"]').contains('republicar').click();
    cy.get('[data-testid="toast"]').contains('republicada');

    // ---- student: sees the update and merges without losing progress ----
    cy.get<string>('@studentTrack').then((path) => cy.visit(path));
    cy.get('[data-testid="origin-update-note"]', { timeout: 10_000 }).should('be.visible');
    cy.get('[data-testid="origin-update-apply"]').click();
    cy.get('[data-testid="toast"]').contains('trilha atualizada');

    cy.get('[data-testid="topic-item"]').contains(`Extra ${stamp}`);
    cy.get('[data-testid="topic-item"]')
      .contains(`Base ${stamp}`)
      .closest('[data-testid="topic-item"]')
      .find('[data-testid="topic-status-toggle"]')
      .should('have.attr', 'aria-label')
      .and('include', 'estudando');
  });
});
