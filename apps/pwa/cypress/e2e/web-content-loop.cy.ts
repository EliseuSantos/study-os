// M7 acceptance: web search via the firecrawl proxy (stubbed), attach an article to a
// topic, read it in-app, and the calm over-budget note. Network fully intercepted.
describe('web content loop', () => {
  const stamp = Date.now();
  const trackTitle = `trilha web ${stamp}`;
  const topicTitle = `Leitura ${stamp}`;
  const articleTitle = `Guia de controle difuso ${stamp}`;
  const articleUrl = `https://exemplo.com/artigo-${stamp}`;

  function stubSearch(): void {
    cy.intercept('GET', 'https://pt.wikipedia.org/w/api.php*', {
      body: { query: { search: [] } },
    });
    cy.intercept('GET', 'https://api.stackexchange.com/**', { body: { items: [] } });
    cy.intercept('GET', '/proxy/youtube/search*', { statusCode: 503, body: { error: 'x' } });
    cy.intercept('GET', '/proxy/firecrawl/search*', {
      body: {
        items: [{ url: articleUrl, title: articleTitle, description: 'panorama do tema.' }],
      },
    }).as('webSearch');
  }

  it('sets up a track with one topic', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-title-input"]').type(trackTitle);
    cy.get('[data-testid="track-submit"]').click();
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-form"] [data-testid="topic-title-input"]').type(topicTitle);
    cy.get('[data-testid="topic-submit"]').click();
    cy.get('[data-testid="topic-title"]').contains(topicTitle);
  });

  it('searches the web source and attaches an article', () => {
    stubSearch();
    cy.visit('/library');
    cy.get('[data-testid="library-filter-web"]').click();
    cy.get('[data-testid="library-search-input"]').type('controle difuso');
    cy.get('[data-testid="library-search-submit"]').click();
    cy.wait('@webSearch');

    cy.get('[data-testid="library-result"]')
      .contains(articleTitle)
      .should('have.attr', 'href')
      .and('include', '/library/read?url=');

    cy.get('[data-testid="library-result"]')
      .contains(articleTitle)
      .closest('[data-testid="library-result"]')
      .find('[data-testid="library-attach"]')
      .click();
    cy.get('[data-testid="attach-track-select"]').select(trackTitle);
    cy.get('[data-testid="attach-topic-select"]').select(topicTitle);
    cy.get('[data-testid="attach-confirm"]').click();
    cy.contains('anexado ·');
  });

  it('opens the attached article in the in-app reader', () => {
    cy.intercept('GET', '/proxy/firecrawl/scrape*', {
      body: {
        url: articleUrl,
        title: articleTitle,
        markdown:
          '# Controle difuso\n\nQualquer juiz pode afastar norma inconstitucional.\n\n- efeito entre as partes\n- via incidental',
      },
    }).as('scrape');

    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-title"]').contains(topicTitle).click();
    cy.get('[data-testid="topic-content-list"] [data-testid="topic-content-item"]')
      .contains(articleTitle)
      .click();

    cy.wait('@scrape');
    cy.get('[data-testid="article-reader"]').should('be.visible');
    cy.get('[data-testid="article-title"]').contains(articleTitle);
    cy.get('[data-testid="article-body"]').contains('Qualquer juiz pode afastar');
    cy.get('[data-testid="article-body"] li').should('have.length', 2);
    cy.contains('abrir original →').should('have.attr', 'href', articleUrl);
  });

  it('shows the calm note when the monthly budget is exhausted', () => {
    cy.intercept('GET', 'https://pt.wikipedia.org/w/api.php*', {
      body: { query: { search: [] } },
    });
    cy.intercept('GET', 'https://api.stackexchange.com/**', { body: { items: [] } });
    cy.intercept('GET', '/proxy/youtube/search*', { statusCode: 503, body: { error: 'x' } });
    cy.intercept('GET', '/proxy/firecrawl/search*', {
      statusCode: 429,
      body: { error: 'firecrawl monthly limit reached' },
    }).as('overBudget');

    cy.visit('/library');
    cy.get('[data-testid="library-search-input"]').type('qualquer coisa');
    cy.get('[data-testid="library-search-submit"]').click();
    cy.wait('@overBudget');
    cy.get('[data-testid="web-over-budget"]').contains('limite mensal');
  });
});
