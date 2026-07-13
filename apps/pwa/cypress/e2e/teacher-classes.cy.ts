// teacher-classes acceptance against the real ephemeral worker: create a turma
// (named share link), copy/QR affordances, student joins via the link and the
// class name shows on import; deleting keeps the link valid.
describe('teacher classes loop', () => {
  const stamp = Date.now();
  const trackTitle = `curso turmas ${stamp}`;
  const className = `manhã ${stamp}`;

  it('creates a turma, student joins by the link, delete keeps the share', () => {
    cy.visit('/settings');
    cy.get('[data-testid="settings-sync-token"]').type('dev-token');
    cy.get('[data-testid="settings-sync-token-save"]').click();
    cy.get('[data-testid="toast"]').contains('token salvo');

    // teacher: track + topic + turma
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.location('pathname').then((p) => cy.wrap(p).as('teacherTrack'));
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`T ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();

    cy.get('[data-testid="class-name-input"]').type(className);
    cy.get('[data-testid="class-create-submit"]').click();
    cy.get('[data-testid="class-item"]').contains(className);
    cy.get('[data-testid="class-qr"]').click();
    cy.get('[data-testid="class-item"] svg').should('exist');

    // student: join via the class link
    cy.get('[data-testid="class-share-url"]')
      .invoke('val')
      .then((url) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, '');
        cy.visit(path);
      });
    cy.get('[data-testid="import-class-note"]').contains(`você está entrando na turma ${className}`);
    cy.get('[data-testid="import-confirm"]').click();
    cy.location('pathname').should('match', /^\/tracks\/.+/);
    cy.get('[data-testid="topic-title"]').contains(`T ${stamp}`);

    // teacher: deleting the turma keeps the published link working
    cy.get<string>('@teacherTrack').then((path) => cy.visit(path));
    cy.get('[data-testid="class-item"]').contains(className);
    cy.get('[data-testid="class-share-url"]')
      .invoke('val')
      .then((url) => cy.wrap(String(url).replace(/^https?:\/\/[^/]+/, '')).as('link'));
    cy.get('[data-testid="class-delete"]').click({ force: true });
    cy.get('[data-testid="toast"]').contains('segue válido');
    cy.get('[data-testid="class-item"]').should('not.exist');

    cy.get<string>('@link').then((path) => cy.visit(path));
    cy.get('[data-testid="import-class-note"]').should('be.visible');
  });
});
