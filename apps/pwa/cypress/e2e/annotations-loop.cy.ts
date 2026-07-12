// M8 acceptance: highlight a saved article, see it in the panel, turn a selection
// into a card (with source) and meet it in the review queue. Network intercepted.
describe('annotations and card-from-selection loop', () => {
  const stamp = Date.now();
  const trackTitle = `trilha anotações ${stamp}`;
  const topicTitle = `Constitucional ${stamp}`;
  const articleUrl = `https://exemplo.com/anotacoes-${stamp}`;
  const markdown =
    '# Panorama\n\nO controle difuso pode ser exercido por qualquer juiz ou tribunal.\n\nO controle concentrado cabe ao STF por meio de ações diretas.';

  function stubArticle(): void {
    cy.intercept('GET', '/proxy/firecrawl/scrape*', {
      body: { url: articleUrl, title: `Artigo ${stamp}`, markdown },
    }).as('scrape');
  }

  function selectInParagraph(
    win: Cypress.AUTWindow,
    index: number,
    start: number,
    end: number,
  ): void {
    const p = win.document.querySelectorAll('p[data-seg]')[index];
    if (!p) throw new Error('paragraph not rendered');
    const walker = win.document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node && (node.textContent ?? '').trim().length < 10) node = walker.nextNode();
    if (!node) throw new Error('text node not found');
    const range = win.document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const sel = win.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    win.document.dispatchEvent(new Event('selectionchange'));
  }

  it('sets up a track with one topic', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-open-form"]').click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(topicTitle);
    cy.get('[data-testid="topic-submit"]').click();
    cy.get('[data-testid="topic-title"]').contains(topicTitle);
  });

  it('highlights a selection, saving the article to a topic on the way', () => {
    stubArticle();
    cy.visit(`/library/read?url=${encodeURIComponent(articleUrl)}`);
    cy.wait('@scrape');
    cy.get('[data-testid="article-body"] p[data-seg]').should('exist');

    cy.window().then((win) => selectInParagraph(win, 0, 2, 18));
    cy.get('[data-testid="selection-actions"]').should('be.visible');
    cy.get('[data-testid="selection-highlight"]').click();

    // first annotation on an unsaved article → topic pick modal
    cy.get('[data-testid="save-annotate-topic"]').click();
    cy.get('[data-testid="save-annotate-topic-search"]').type('constitucional');
    cy.get('[role="option"]').first().click();
    cy.get('[data-testid="save-annotate-confirm"]').click();

    cy.get('mark.hl').should('have.length', 1);
    cy.contains('destaques · 1').click();
    cy.get('[data-testid="annotations-panel"]').contains('controle difuso');
  });

  it('creates a card from a selection and finds it in review', () => {
    stubArticle();
    cy.visit(`/library/read?url=${encodeURIComponent(articleUrl)}`);
    cy.wait('@scrape');
    cy.get('[data-testid="article-body"] p[data-seg]').should('exist');

    cy.window().then((win) => selectInParagraph(win, 1, 2, 40));
    cy.get('[data-testid="selection-card"]').click();

    cy.get('[data-testid="card-selection-front"]')
      .invoke('val')
      .should('match', /^Explique:/);
    cy.get('[data-testid="card-selection-save"]').click();
    cy.get('[data-testid="toast"]').contains('card criado');

    // the new card reaches the review queue (fresh cards after due ones)
    cy.visit('/review');
    cy.get('[data-testid="review-front"]').should('exist');
  });
});
