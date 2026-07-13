// teacher-progress acceptance vs the real worker: the panel stays calm under
// the k-floor and shows aggregates once 3 anonymous devices reported.
describe('teacher progress dashboard', () => {
  const stamp = Date.now();
  const trackTitle = `curso progresso ${stamp}`;
  const WORKER = Cypress.env('WORKER') ?? 'http://localhost:8787';

  it('shows the calm empty state, then aggregates after 3 devices', () => {
    cy.visit('/settings');
    cy.get('[data-testid="settings-sync-token"]').type('dev-token');
    cy.get('[data-testid="settings-sync-token-save"]').click();
    cy.get('[data-testid="toast"]').contains('token salvo');

    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(`T ${stamp}`);
    cy.get('[data-testid="topic-submit"]').click();

    cy.get('[data-testid="class-name-input"]').type(`turma ${stamp}`);
    cy.get('[data-testid="class-create-submit"]').click();
    cy.get('[data-testid="class-item"]').contains(`turma ${stamp}`);

    // under the k-floor: calm copy
    cy.get('[data-testid="class-progress-open"]').click();
    cy.get('[data-testid="class-progress-empty"]').contains('3 ou mais');

    // three anonymous devices report (public endpoint, like real students)
    cy.get('[data-testid="class-share-url"]')
      .invoke('val')
      .then((url) => {
        const shareId = String(url).split('share=')[1];
        // the sid of the only topic = the owner's topic id
        cy.get('[data-testid="topic-item"]')
          .first()
          .then(() => {
          for (const [i, done] of [1, 1, 0].entries()) {
            cy.request({
              method: 'POST',
              url: `${WORKER}/class/${shareId}/progress`,
              body: {
                anon_id: `e2e-anon-${stamp}-${i}`.padEnd(20, 'x'),
                payload: {
                  topics_done: done,
                  topics_total: 1,
                  week_minutes: 30,
                  topics: {},
                },
              },
            });
          }
        });
      });

    // teacher revisits later: reload, reopen the panel, aggregates are there
    cy.reload();
    cy.get('[data-testid="class-progress-open"]').click();
    cy.get('[data-testid="class-progress-panel"]')
      .contains('3 dispositivos')
      .should('be.visible');
  });
});
