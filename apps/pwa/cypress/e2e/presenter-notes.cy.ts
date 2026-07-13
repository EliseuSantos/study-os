// presenter-notes acceptance: per-slide script edited in the lesson editor,
// visible only in presenter mode (n toggles), never in the published share.
describe('presenter notes loop', () => {
  const stamp = Date.now();
  const trackTitle = `curso roteiro ${stamp}`;
  const script = `citar o caso concreto ${stamp}`;

  it('writes a per-slide script and sees it in presenter mode via n', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`T ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();

    cy.get('[data-testid="topic-title"]').contains(`T ${stamp}`).click();
    cy.get('[data-testid="stage-tabs"]').contains('aulas').click();
    cy.get('[data-testid="lesson-title-input"]').type(`aula ${stamp}`);
    cy.get('[data-testid="lesson-submit"]').click();
    cy.get('[data-testid="lesson-item-row"]').contains(`aula ${stamp}`).click();

    // one text item + its script
    cy.get('[data-testid="item-kind-select"]').select('nota');
    cy.get('[data-testid="item-body-input"]').type('conteúdo do slide');
    cy.get('[data-testid="item-add-submit"]').click();
    cy.get('[data-testid="item-notes-toggle"]').click();
    cy.get('[data-testid="item-notes-input"]').type(script);
    cy.get('[data-testid="item-notes-save"]').click();
    cy.get('[data-testid="toast"]').contains('roteiro salvo');

    // present: script hidden until n
    cy.get('[data-testid="present-link"]').click();
    cy.get('[data-testid="present-start"]').click();
    cy.get('[data-testid="presenter-item-notes"]').should('not.exist');
    cy.get('body').type('n');
    cy.get('[data-testid="presenter-item-notes"]').contains(script);
    cy.get('[data-testid="presenter-timer"]').should('be.visible');
    cy.get('body').type('n');
    cy.get('[data-testid="presenter-item-notes"]').should('not.exist');
  });
});
