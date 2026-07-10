// M5 acceptance: author a lesson with a quiz, present it, share it (stubbed worker)
// and import a snapshot as a new track.
describe('teacher mode loop', () => {
  const stamp = Date.now();
  const trackTitle = `curso e2e ${stamp}`;
  const topicTitle = `Ponteiros ${stamp}`;
  const lessonTitle = `Aula 1 ${stamp}`;

  it('authors a lesson with topic, note and quiz items', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(topicTitle);
    cy.get('[data-testid="topic-submit"]').click();

    cy.get('[data-testid="lesson-title-input"]').type(lessonTitle);
    cy.get('[data-testid="lesson-submit"]').click();
    cy.get('[data-testid="lesson-item-row"]').contains(lessonTitle).click();

    cy.get('[data-testid="lesson-editor"]').should('be.visible');
    cy.get('[data-testid="lesson-notes-input"]').type('lembrar de citar exemplos reais');

    cy.get('[data-testid="item-kind-select"]').select('topic');
    cy.get('[data-testid="item-topic-select"]').select(topicTitle);
    cy.get('[data-testid="item-add-submit"]').click();

    cy.get('[data-testid="item-kind-select"]').select('quiz');
    cy.get('[data-testid="quiz-question-input"]').type('o que um ponteiro guarda?');
    cy.get('[data-testid="quiz-options-input"]').type(
      'um valor\num endereço de memória\numa função',
    );
    cy.get('[data-testid="quiz-answer-input"]').clear();
    cy.get('[data-testid="quiz-answer-input"]').type('2');
    cy.get('[data-testid="item-add-submit"]').click();

    cy.get('[data-testid="lesson-item"]').should('have.length', 2);
  });

  it('presents the lesson with interactive quiz', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="lesson-item-row"]').contains(lessonTitle).click();
    cy.get('[data-testid="present-link"]').click();

    cy.get('[data-testid="present-start"]').click();
    cy.get('[data-testid="slide"]').contains(topicTitle);
    cy.get('[data-testid="slide-index"]').contains('1 · 2');

    cy.get('body').type('{rightarrow}');
    cy.get('[data-testid="slide"]').contains('o que um ponteiro guarda?');
    cy.get('[data-testid="quiz-option-1"]').click();
    cy.get('[data-testid="quiz-correct"]').should('exist').and('contain', 'endereço de memória');

    cy.get('[data-testid="presenter-toggle"]').click();
    cy.get('[data-testid="presenter-notes"]').contains('exemplos reais');
    cy.get('[data-testid="presenter-timer"]').should('be.visible');

    cy.get('[data-testid="present-exit"]').click();
    cy.get('[data-testid="present-start"]').should('be.visible');
  });

  it('shares the track (stubbed) and shows the QR', () => {
    cy.intercept('POST', '/share', { body: { id: 'abc123def456', hash: 'feedfacecafebeef' } }).as(
      'share',
    );
    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="share-track"]').click();
    cy.wait('@share');
    cy.get('[data-testid="share-url"]')
      .invoke('val')
      .should('include', '/import?share=abc123def456');
    cy.get('[data-testid="share-qr"] svg').should('exist');
  });

  it('exports and re-imports the track as a file', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="export-json"]').click();
    cy.readFile(`cypress/downloads/curso-e2e-${stamp}.studyos.json`).then((snapshot) => {
      cy.visit('/import');
      cy.get('[data-testid="import-json-input"]').selectFile(
        {
          contents: Cypress.Buffer.from(JSON.stringify(snapshot)),
          fileName: 'reimport.studyos.json',
          mimeType: 'application/json',
        },
        { force: true },
      );
      cy.location('pathname').should('match', /^\/tracks\/.+/);
      cy.get('[data-testid="topic-title"]').contains(topicTitle);
      cy.get('[data-testid="lesson-item-row"]').contains(lessonTitle);
    });
  });

  it('imports from a share link (stubbed)', () => {
    cy.readFile(`cypress/downloads/curso-e2e-${stamp}.studyos.json`).then((snapshot) => {
      cy.intercept('GET', '/share/xyz789shared', {
        body: { snapshot, hash: 'feedfacecafebeef' },
      }).as('getShare');
      cy.visit('/import?share=xyz789shared');
      cy.wait('@getShare');
      cy.get('[data-testid="import-preview"]').contains(trackTitle);
      cy.get('[data-testid="import-confirm"]').click();
      cy.location('pathname').should('match', /^\/tracks\/.+/);
      cy.get('[data-testid="topic-title"]').contains(topicTitle);
    });
  });
});
