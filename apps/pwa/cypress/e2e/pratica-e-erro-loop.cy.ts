// M9 acceptance: an error becomes a scheduled card and shows on the track's
// errors tab; rating buttons preview intervals and undo restores state; the
// topic quiz measures accuracy. Network-free (local db only).
describe('pratica e erro loop', () => {
  const stamp = Date.now();
  const errorQuestion = `errei o prazo da ADI ${stamp}`;

  const snapshot = {
    format: 'studyos-track',
    version: 1,
    exported_at: 1767225600000,
    track: { title: `trilha quiz ${stamp}`, description: null, mode: 'schedule' },
    topics: [{ key: 0, parent_key: null, title: `Quiz tópico ${stamp}`, notes_md: null, position: 0 }],
    cards: [
      {
        topic_key: 0,
        kind: 'quiz',
        front_md: JSON.stringify({
          q: 'Quem exerce o controle difuso?',
          options: ['Apenas o STF', 'Qualquer juiz ou tribunal'],
          answer: 1,
        }),
        back_md: null,
        options_json: null,
      },
    ],
    lessons: [],
    lesson_items: [],
    content: [],
  };

  it('registers an error and finds it on the errors tab', () => {
    // a topic must exist for the error to live in
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(`trilha erros ${stamp}`);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(`trilha erros ${stamp}`).click();
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`Erros ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();

    cy.visit('/study');
    cy.get('[data-testid="error-log-open"]').click();
    cy.get('[data-testid="error-question-input"]').type(errorQuestion);
    cy.get('[data-testid="error-answer-input"]').type('o prazo correto era 30 dias');
    cy.get('[data-testid="error-topic-select"]').click();
    cy.get(`[data-testid="error-topic-select-search"]`).type(`Erros ${stamp}`);
    cy.get('[role="option"]').first().click();
    cy.get('[data-testid="error-log-submit"]').click();
    cy.get('[data-testid="toast"]').contains('erro salvo');

    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(`trilha erros ${stamp}`).click();
    cy.get('[data-testid="stage-tabs"]').contains('erros').click();
    cy.get('[data-testid="errors-panel"] [data-testid="error-item"]').contains(errorQuestion);
  });

  it('reviews with interval previews and undoes the last rating', () => {
    cy.visit('/review');
    cy.get('[data-testid="review-reveal"]').click();
    // every rating button shows its projected interval
    cy.get('[data-testid="rating-4"]').contains(/min|h|d|mês/);
    cy.get('[data-testid="rating-3"]').click();
    cy.get('[data-testid="review-undo"]').click();
    // the rated card is back in front, face down (other specs may share the queue)
    cy.get('[data-testid="review-reveal"]').should('be.visible');
    cy.get('[data-testid="review-front"]').should('be.visible');
  });

  it('practices the topic quiz and records measured accuracy', () => {
    cy.visit('/import');
    cy.get('[data-testid="import-json-input"]').selectFile(
      {
        contents: Cypress.Buffer.from(JSON.stringify(snapshot)),
        fileName: 'quiz.studyos.json',
        mimeType: 'application/json',
      },
      { force: true },
    );
    cy.location('pathname').should('match', /^\/tracks\/.+/);
    cy.get('[data-testid="topic-title"]').contains(`Quiz tópico ${stamp}`).click();
    cy.get('[data-testid="topic-quiz-start"]').click();

    cy.get('[data-testid="quiz-question"]').contains('controle difuso');
    cy.get('[data-testid="quiz-option"]').eq(1).click();
    cy.contains('certa.');
    cy.get('[data-testid="quiz-next"]').click();
    cy.get('[data-testid="quiz-score"]').contains('1 de 1');
    cy.get('[data-testid="toast"]').contains('prática registrada');

    // measured accuracy reaches the dashboard
    cy.visit('/');
    cy.get('[data-testid="stats-accuracy"]').contains('medido');
  });
});
