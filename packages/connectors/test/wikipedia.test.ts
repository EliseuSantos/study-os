import { expect, test } from 'bun:test';
import { wikipediaConnector } from '../src/wikipedia';
import type { FetchLike } from '../src/types';

function stubFetch(body: string, status: number): FetchLike {
  return () => Promise.resolve(new Response(body, { status }));
}

function stubJson(body: unknown): FetchLike {
  return stubFetch(JSON.stringify(body), 200);
}

function rejectingFetch(message: string): FetchLike {
  return () => Promise.reject(new Error(message));
}

function searchItem(i: number): Record<string, unknown> {
  return {
    ns: 0,
    title: `Fotossíntese — resultado ${i}`,
    pageid: 1000 + i,
    size: 4321,
    wordcount: 100 + i,
    snippet: `trecho <span class="searchmatch">resultado</span> ${i}`,
    timestamp: '2026-01-01T00:00:00Z',
  };
}

test('wikipedia maps search results and caps at 10', async () => {
  const requested: string[] = [];
  const fixture = stubJson({
    batchcomplete: '',
    query: {
      searchinfo: { totalhits: 12 },
      search: Array.from({ length: 12 }, (_, i) => searchItem(i)),
    },
  });
  const emptyTitle = stubJson({ pages: [] });
  const fetchFn: FetchLike = (url, init) => {
    requested.push(url);
    return url.includes('/rest.php/v1/search/title') ? emptyTitle(url, init) : fixture(url, init);
  };

  const results = await wikipediaConnector.search('fotossíntese clorofila', fetchFn);

  expect(requested.toSorted()).toEqual([
    'https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=fotoss%C3%ADntese%20clorofila',
    'https://pt.wikipedia.org/w/rest.php/v1/search/title?limit=5&q=fotossintese',
  ]);
  expect(results.length).toBe(10);
  expect(results[0]).toEqual({
    source: 'wikipedia',
    external_id: '1000',
    url: 'https://pt.wikipedia.org/wiki/Fotoss%C3%ADntese_%E2%80%94_resultado_0',
    title: 'Fotossíntese — resultado 0',
    kind: 'article',
    description: 'trecho resultado 0',
    meta: { snippet: 'trecho <span class="searchmatch">resultado</span> 0', wordcount: 100 },
  });
});

test('wikipedia decodes entities in description and keeps raw snippet in meta', async () => {
  const fetchFn = stubJson({
    query: {
      search: [
        {
          title: 'Café',
          pageid: 7,
          wordcount: 50,
          snippet: '<span class="searchmatch">caf&eacute;</span> &amp; ch&#225;',
        },
      ],
    },
  });

  const results = await wikipediaConnector.search('café', fetchFn);
  expect(results.length).toBe(1);
  // &eacute; is not in the supported set, stays as-is; &amp; and numeric decode.
  expect(results[0]?.description).toBe('caf&eacute; & chá');
  expect(results[0]?.meta['snippet']).toBe(
    '<span class="searchmatch">caf&eacute;</span> &amp; ch&#225;',
  );
});

test('wikipedia returns [] on non-2xx', async () => {
  expect(await wikipediaConnector.search('x', stubFetch('server error', 500))).toEqual([]);
});

test('wikipedia returns [] on malformed json', async () => {
  expect(await wikipediaConnector.search('x', stubFetch('<!doctype html>', 200))).toEqual([]);
});

test('wikipedia returns [] on unexpected json shape', async () => {
  expect(await wikipediaConnector.search('x', stubJson({ query: { search: 'nope' } }))).toEqual([]);
});

test('wikipedia returns [] when fetch throws', async () => {
  expect(await wikipediaConnector.search('x', rejectingFetch('network down'))).toEqual([]);
});

test('title-search hits lead the merge and dedupe against full-text', async () => {
  const titleFixture = stubJson({
    pages: [
      { id: 1, title: 'Verbo', description: 'classe de palavras' },
      { id: 2, title: 'Verbo de ligação', description: null },
    ],
  });
  const textFixture = stubJson({
    query: {
      search: [
        // duplicate of the title hit — must not repeat
        { pageid: 1, title: 'Verbo', snippet: 'o <b>verbo</b> to be', wordcount: 10 },
        { pageid: 3, title: 'E-Prime', snippet: 'sem usar o verbo ser, to be', wordcount: 10 },
        // never mentions the anchor — the guard drops it
        { pageid: 4, title: 'Nodemon', snippet: 'restarting due to changes', wordcount: 10 },
      ],
    },
  });
  const fetchFn: FetchLike = (url, init) =>
    url.includes('/rest.php/v1/search/title') ? titleFixture(url, init) : textFixture(url, init);

  const results = await wikipediaConnector.search('verbo to-be', fetchFn);

  expect(results.map((r) => r.title)).toEqual(['Verbo', 'Verbo de ligação', 'E-Prime']);
  expect(results[0]?.description).toBe('classe de palavras');
});
