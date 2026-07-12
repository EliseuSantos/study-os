// M4 acceptance: search (stubbed sources), attach a video to a topic, see it on the
// topic, and find things via the global FTS search. Network is fully intercepted.
describe('library and content loop', () => {
  const stamp = Date.now();
  const trackTitle = `trilha conteúdo ${stamp}`;
  const topicTitle = `Controle difuso ${stamp}`;
  const videoTitle = `Aula de controle difuso ${stamp}`;

  function stubSources(): void {
    // firecrawl-first: search goes only through the worker proxies (web + youtube)
    cy.intercept('GET', '/proxy/firecrawl/search*', { body: { items: [] } }).as('web');
    cy.intercept('GET', '/proxy/youtube/search*', {
      body: {
        items: [
          {
            id: 'dQw4w9WgXcQ',
            title: videoTitle,
            channel: 'prof e2e',
            thumbnail: null,
            duration: null,
          },
        ],
      },
    }).as('yt');
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

  it('searches the library and attaches a video to the topic', () => {
    stubSources();
    cy.visit('/library');
    cy.get('[data-testid="library-search-input"]').type('controle difuso');
    cy.get('[data-testid="library-search-submit"]').click();
    cy.wait('@yt');

    cy.get('[data-testid="library-result"]').contains(videoTitle);
    cy.get('[data-testid="library-result"]')
      .contains(videoTitle)
      .closest('[data-testid="library-result"]')
      .find('[data-testid="library-attach"]')
      .click();
    cy.get('[data-testid="attach-track-select"]').select(trackTitle);
    cy.get('[data-testid="attach-topic-select"]').select(topicTitle);
    cy.get('[data-testid="attach-confirm"]').click();
    cy.contains('anexado ·');
  });

  it('shows the attached video on the topic and plays it with transcript', () => {
    cy.visit('/tracks');
    cy.get('[data-testid="track-item"]').contains(trackTitle).click();
    cy.get('[data-testid="topic-title"]').contains(topicTitle).click();
    cy.get('[data-testid="stage-tabs"]').contains('conteúdo').click();
    cy.get('[data-testid="topic-content-list"] [data-testid="topic-content-item"]')
      .contains(videoTitle)
      .should('have.attr', 'href')
      .and('include', '/library/watch/dQw4w9WgXcQ');

    cy.intercept('GET', '/proxy/youtube/transcript*', {
      headers: { 'content-type': 'text/xml' },
      body: '<?xml version="1.0"?><transcript><text start="1.0" dur="2.0">primeira fala</text><text start="3.5" dur="2.0">segunda fala</text></transcript>',
    }).as('transcript');
    cy.visit('/library/watch/dQw4w9WgXcQ');
    cy.wait('@transcript');
    cy.get('[data-testid="video-player"]').should('be.visible');
    // the cue text lives beside the timestamp button since the redesign
    cy.get('[data-testid="transcript-cue"]').should('have.length', 2);
    cy.get('[data-testid="transcript-panel"]').contains('primeira fala');
  });

  it('finds the topic and the content via global search', () => {
    cy.visit('/');
    // global search moved into the ⌘K palette in the desktop-shell redesign
    cy.get('body').type('{ctrl}k');
    cy.get('[data-testid="command-palette-input"]').type('Controle difuso');
    cy.get('[data-testid="palette-row"]').contains(topicTitle);
    cy.get('[data-testid="command-palette-input"]').clear();
    cy.get('[data-testid="command-palette-input"]').type('Aula de controle');
    cy.get('[data-testid="palette-row"]').contains(videoTitle);
  });
});
