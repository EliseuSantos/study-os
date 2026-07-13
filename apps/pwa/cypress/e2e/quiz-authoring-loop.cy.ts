// quiz-authoring acceptance: author a question in the topic panel, practice it
// (one wrong answer), and see the local error rate. Local-only.
describe('quiz authoring loop', () => {
  const stamp = Date.now();
  const trackTitle = `trilha autoria ${stamp}`;

  it('authors a quiz question and sees the per-question error rate', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`T ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();
    cy.get('[data-testid="topic-title"]').contains(`T ${stamp}`).click();

    // author: quiz mode, 3 options, 2nd correct
    cy.get('[data-testid="card-form-toggle"]').click();
    cy.get('[data-testid="card-kind-toggle"]').contains('questão').click();
    cy.get('[data-testid="quiz-question-input"]').type(`quem julga a ADI? ${stamp}`);
    cy.get('[data-testid="quiz-add-option"]').click();
    cy.get('[data-testid="quiz-option-input"]').eq(0).type('qualquer juiz');
    cy.get('[data-testid="quiz-option-input"]').eq(1).type('o STF');
    cy.get('[data-testid="quiz-option-input"]').eq(2).type('o senado');
    cy.get('input[name="quiz-answer"]').eq(1).check();
    cy.get('[data-testid="card-submit"]').click();
    cy.get('[data-testid="toast"]').contains('questão criada');
    cy.get('[data-testid="card-item"]').contains('quem julga a ADI?');

    // practice with a wrong answer
    cy.get('[data-testid="topic-quiz-start"]').click();
    cy.get('[data-testid="quiz-option"]').eq(0).click();
    cy.contains('a resposta era a 2.');
    cy.get('[data-testid="quiz-next"]').click();
    cy.get('[data-testid="quiz-score"]').contains('0 de 1');
    cy.get('[data-testid="topic-quiz"] button').contains('fechar').click();

    // local error rate on the card list
    cy.get('[data-testid="quiz-error-rate"]').contains('errada em 100% das tentativas');
  });

  it('edits the question and practices the whole track', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-title"]').contains(`T ${stamp}`).click();

    cy.get('[data-testid="quiz-edit"]').click();
    cy.get('[data-testid="quiz-question-input"]').clear();
    cy.get('[data-testid="quiz-question-input"]').type(`quem processa e julga a ADI? ${stamp}`);
    cy.get('[data-testid="card-submit"]').click();
    cy.get('[data-testid="toast"]').contains('questão atualizada');
    cy.get('[data-testid="card-item"]').contains('quem processa e julga a ADI?');

    cy.get('[data-testid="track-quiz-start"]').click();
    cy.get('[data-testid="quiz-question"]').contains('quem processa e julga a ADI?');
    cy.get('[data-testid="quiz-option"]').eq(1).click();
    cy.contains('certa.');
  });
});
