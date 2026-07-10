import { expect, test } from 'bun:test';
import { stackexchangeConnector } from '../src/stackexchange';
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

function questionItem(i: number): Record<string, unknown> {
  return {
    tags: ['typescript'],
    owner: { display_name: `user${i}` },
    is_answered: i % 2 === 0,
    view_count: 1000 + i,
    answer_count: i,
    score: 10 + i,
    creation_date: 1700000000 + i,
    question_id: 5000 + i,
    link: `https://stackoverflow.com/questions/${5000 + i}/some-question-${i}`,
    title: `Question ${i}`,
  };
}

test('stackexchange maps results, decodes html entities in titles and caps at 10', async () => {
  const requested: string[] = [];
  const items = Array.from({ length: 12 }, (_, i) => questionItem(i));
  items[0] = {
    ...questionItem(0),
    title: 'How to use &quot;async&quot; &amp; await in a &lt;script&gt; tag&#39;s body?',
  };
  const fixture = stubJson({ items, has_more: true, quota_max: 300, quota_remaining: 299 });
  const fetchFn: FetchLike = (url, init) => {
    requested.push(url);
    return fixture(url, init);
  };

  const results = await stackexchangeConnector.search('async await', fetchFn);

  expect(requested).toEqual([
    'https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&order=desc&sort=relevance&q=async%20await',
  ]);
  expect(results.length).toBe(10);
  expect(results[0]).toEqual({
    source: 'stackexchange',
    external_id: '5000',
    url: 'https://stackoverflow.com/questions/5000/some-question-0',
    title: 'How to use "async" & await in a <script> tag\'s body?',
    kind: 'qa',
    description: null,
    meta: { score: 10, answer_count: 0, is_answered: true },
  });
});

test('stackexchange returns [] on non-2xx', async () => {
  expect(await stackexchangeConnector.search('x', stubFetch('{"error_id":502}', 400))).toEqual([]);
});

test('stackexchange returns [] on malformed json', async () => {
  expect(await stackexchangeConnector.search('x', stubFetch('not json at all', 200))).toEqual([]);
});

test('stackexchange returns [] on unexpected json shape', async () => {
  expect(await stackexchangeConnector.search('x', stubJson({ items: { nope: true } }))).toEqual([]);
});

test('stackexchange returns [] when fetch throws', async () => {
  expect(await stackexchangeConnector.search('x', rejectingFetch('offline'))).toEqual([]);
});
