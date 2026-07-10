import { expect, test } from 'bun:test';
import { youtubeConnector } from '../src/youtube';
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

test('youtube calls the app-relative proxy and maps the frozen wire format', async () => {
  const requested: string[] = [];
  const fixture = stubJson({
    items: [
      {
        id: 'dQw4w9WgXcQ',
        title: 'Aula 1 — introdução',
        channel: 'Canal de Estudos',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        duration: 'PT12M34S',
      },
      {
        id: 'abc123def45',
        title: 'Aula 2',
        channel: 'Canal de Estudos',
        thumbnail: 'https://i.ytimg.com/vi/abc123def45/mqdefault.jpg',
        duration: null,
      },
    ],
  });
  const fetchFn: FetchLike = (url, init) => {
    requested.push(url);
    return fixture(url, init);
  };

  const results = await youtubeConnector.search('fsrs revisão espaçada', fetchFn);

  expect(requested).toEqual(['/proxy/youtube/search?q=fsrs%20revis%C3%A3o%20espa%C3%A7ada']);
  expect(results.length).toBe(2);
  expect(results[0]).toEqual({
    source: 'youtube',
    external_id: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Aula 1 — introdução',
    kind: 'video',
    description: null,
    meta: {
      channel: 'Canal de Estudos',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      duration: 'PT12M34S',
    },
  });
  expect(results[1]?.meta['duration']).toBeNull();
});

test('youtube caps at 10 results', async () => {
  const fetchFn = stubJson({
    items: Array.from({ length: 12 }, (_, i) => ({
      id: `video-id-${i}`,
      title: `Vídeo ${i}`,
      channel: 'Canal',
      thumbnail: `https://i.ytimg.com/vi/video-id-${i}/mqdefault.jpg`,
      duration: null,
    })),
  });
  const results = await youtubeConnector.search('x', fetchFn);
  expect(results.length).toBe(10);
});

test('youtube returns [] on non-2xx (e.g. proxy 503 when unconfigured)', async () => {
  const fetchFn = stubFetch('{"error":"youtube api not configured"}', 503);
  expect(await youtubeConnector.search('x', fetchFn)).toEqual([]);
});

test('youtube returns [] on malformed json', async () => {
  expect(await youtubeConnector.search('x', stubFetch('<html>oops</html>', 200))).toEqual([]);
});

test('youtube returns [] on unexpected json shape', async () => {
  expect(await youtubeConnector.search('x', stubJson({ items: 'nope' }))).toEqual([]);
});

test('youtube returns [] when fetch throws', async () => {
  expect(await youtubeConnector.search('x', rejectingFetch('fetch failed'))).toEqual([]);
});
