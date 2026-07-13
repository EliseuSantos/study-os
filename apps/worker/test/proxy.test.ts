import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cloneResponse, setCacheForTesting, type CacheLike } from '../src/cache';
import { createApp } from '../src/index';
import type { Env } from '../src/env';
import { createFakeD1 } from './fake-d1';
import { FakeR2 } from './fake-r2';

const TOKEN = 'test';
const app = createApp();
const AUTH = { headers: { authorization: `Bearer ${TOKEN}` } };

// recorded-shape fixture: YouTube Data API v3 search response (trimmed)
const YT_SEARCH_FIXTURE = {
  kind: 'youtube#searchListResponse',
  items: [
    {
      id: { kind: 'youtube#video', videoId: 'vid-11' },
      snippet: {
        title: 'Direito constitucional — aula 1',
        channelTitle: 'Canal Estudos',
        thumbnails: {
          default: { url: 'https://i.ytimg.com/vi/vid-11/default.jpg' },
          medium: { url: 'https://i.ytimg.com/vi/vid-11/mqdefault.jpg' },
        },
      },
    },
    {
      id: { kind: 'youtube#video', videoId: 'vid-22' },
      snippet: {
        title: 'Aula 2',
        channelTitle: 'Outro Canal',
        thumbnails: { default: { url: 'https://i.ytimg.com/vi/vid-22/default.jpg' } },
      },
    },
    // no videoId (channel result): must be skipped by the mapper
    { id: { kind: 'youtube#channel' }, snippet: { title: 'Canal', channelTitle: 'Canal' } },
  ],
};

class FakeCache implements CacheLike {
  private readonly store = new Map<string, Response>();

  async match(req: Request): Promise<Response | undefined> {
    const res = this.store.get(req.url);
    return res === undefined ? undefined : cloneResponse(res);
  }

  async put(req: Request, res: Response): Promise<void> {
    this.store.set(req.url, res);
  }

  async delete(req: Request): Promise<boolean> {
    return this.store.delete(req.url);
  }

  get size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}

const realFetch = globalThis.fetch;

let env: Env;
let cache: FakeCache;
let fetched: string[];
let responder: (url: string) => Response;

beforeEach(async () => {
  env = {
    DB: await createFakeD1(),
    SYNC_TOKEN: TOKEN,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SHARES: new FakeR2(),
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: '{}',
    VAPID_SUBJECT: 'mailto:test@example.com',
    YOUTUBE_API_KEY: 'yt-key',
  };
  cache = new FakeCache();
  setCacheForTesting(cache);

  fetched = [];
  responder = () => new Response(null, { status: 500 });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetched.push(url);
    if (url.includes('boom')) throw new Error('network down');
    return responder(url);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setCacheForTesting(null);
});

describe('proxy auth', () => {
  test('all proxy routes require the bearer token', async () => {
    for (const path of [
      '/proxy/youtube/search?q=x',
      '/proxy/youtube/transcript?id=vid-11',
      '/proxy/rss?url=https%3A%2F%2Fexample.com%2Ffeed.xml',
    ]) {
      const res = await app.request(path, {}, env);
      expect(res.status).toBe(401);
      expect(fetched).toHaveLength(0);
    }
  });
});

describe('/proxy/youtube/search', () => {
  test('missing q returns 400', async () => {
    expect((await app.request('/proxy/youtube/search', AUTH, env)).status).toBe(400);
    expect((await app.request('/proxy/youtube/search?q=%20%20', AUTH, env)).status).toBe(400);
  });

  test('missing YOUTUBE_API_KEY returns 503', async () => {
    const { YOUTUBE_API_KEY: _unused, ...rest } = env;
    const res = await app.request('/proxy/youtube/search?q=direito', AUTH, rest as Env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'youtube api not configured' });
    expect(fetched).toHaveLength(0);
  });

  test('maps the Data API response to the frozen wire format', async () => {
    responder = () => Response.json(YT_SEARCH_FIXTURE);

    const res = await app.request('/proxy/youtube/search?q=Direito', AUTH, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=21600');

    const upstream = new URL(fetched[0] ?? '');
    expect(upstream.origin + upstream.pathname).toBe(
      'https://www.googleapis.com/youtube/v3/search',
    );
    expect(upstream.searchParams.get('part')).toBe('snippet');
    expect(upstream.searchParams.get('type')).toBe('video');
    expect(upstream.searchParams.get('maxResults')).toBe('10');
    expect(upstream.searchParams.get('key')).toBe('yt-key');

    expect(await res.json()).toEqual({
      items: [
        {
          id: 'vid-11',
          title: 'Direito constitucional — aula 1',
          channel: 'Canal Estudos',
          thumbnail: 'https://i.ytimg.com/vi/vid-11/mqdefault.jpg',
          duration: null,
        },
        {
          id: 'vid-22',
          title: 'Aula 2',
          channel: 'Outro Canal',
          thumbnail: 'https://i.ytimg.com/vi/vid-22/default.jpg',
          duration: null,
        },
      ],
    });
  });

  test('second call is served from cache, normalized on the query', async () => {
    responder = () => Response.json(YT_SEARCH_FIXTURE);

    const first = await app.request('/proxy/youtube/search?q=direito', AUTH, env);
    // different case/whitespace, same normalized cache key
    const second = await app.request('/proxy/youtube/search?q=%20DiReiTo%20', AUTH, env);

    expect(fetched).toHaveLength(1);
    expect(cache.size).toBe(1);
    expect(cache.keys()[0]).toBe('https://cache.studyos/yt-search?q=direito');
    expect(await second.json()).toEqual(await first.json());
  });

  test('upstream failure returns 502 and is not cached', async () => {
    const res = await app.request('/proxy/youtube/search?q=direito', AUTH, env);
    expect(res.status).toBe(502);
    expect(cache.size).toBe(0);
  });
});

describe('/proxy/youtube/transcript', () => {
  const PT_XML = '<transcript><text start="0" dur="2">olá</text></transcript>';
  const EN_XML = '<transcript><text start="0" dur="2">hello</text></transcript>';

  test('invalid id returns 400', async () => {
    for (const id of ['', 'abc', 'a'.repeat(21), 'bad%20id', 'in%2Fvalid']) {
      const res = await app.request(`/proxy/youtube/transcript?id=${id}`, AUTH, env);
      expect(res.status).toBe(400);
    }
    expect(fetched).toHaveLength(0);
  });

  test('returns the pt transcript as text/xml when available', async () => {
    responder = () => new Response(PT_XML);

    const res = await app.request('/proxy/youtube/transcript?id=vid-11', AUTH, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(await res.text()).toBe(PT_XML);
    expect(fetched).toEqual(['https://www.youtube.com/api/timedtext?v=vid-11&lang=pt']);
  });

  test('falls back to en when the pt track is an empty 200 body', async () => {
    responder = (url) => new Response(url.includes('lang=pt') ? '' : EN_XML);

    const res = await app.request('/proxy/youtube/transcript?id=vid-11', AUTH, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(EN_XML);
    expect(fetched).toEqual([
      'https://www.youtube.com/api/timedtext?v=vid-11&lang=pt',
      'https://www.youtube.com/api/timedtext?v=vid-11&lang=en',
    ]);
  });

  test('404 when neither language has a track', async () => {
    responder = () => new Response('');

    const res = await app.request('/proxy/youtube/transcript?id=vid-11', AUTH, env);
    expect(res.status).toBe(404);
    expect(fetched).toHaveLength(2);
    expect(cache.size).toBe(0);
  });

  test('second call is served from cache', async () => {
    responder = () => new Response(PT_XML);

    await app.request('/proxy/youtube/transcript?id=vid-11', AUTH, env);
    const second = await app.request('/proxy/youtube/transcript?id=vid-11', AUTH, env);

    expect(fetched).toHaveLength(1);
    expect(await second.text()).toBe(PT_XML);
  });
});

describe('/proxy/rss', () => {
  const FEED = '<?xml version="1.0"?><rss version="2.0"><channel/></rss>';

  function rssPath(url: string): string {
    return `/proxy/rss?url=${encodeURIComponent(url)}`;
  }

  test('rejects non-https and private hosts with 400', async () => {
    for (const url of [
      'not a url',
      'http://example.com/feed.xml',
      'ftp://example.com/feed.xml',
      'https://localhost/feed.xml',
      'https://127.0.0.1/feed.xml',
      'https://10.1.2.3/feed.xml',
      'https://192.168.1.30/feed.xml',
      'https://[::1]/feed.xml',
      'https://sync.internal/feed.xml',
    ]) {
      const res = await app.request(rssPath(url), AUTH, env);
      expect(res.status).toBe(400);
    }
    expect(fetched).toHaveLength(0);
  });

  test('passes through body and content-type, then serves from cache', async () => {
    responder = () =>
      new Response(FEED, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });

    const res = await app.request(rssPath('https://example.com/feed.xml'), AUTH, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await res.text()).toBe(FEED);

    const second = await app.request(rssPath('https://example.com/feed.xml'), AUTH, env);
    expect(fetched).toHaveLength(1);
    expect(await second.text()).toBe(FEED);
  });

  test('upstream non-2xx returns 502', async () => {
    responder = () => new Response('nope', { status: 404 });
    const res = await app.request(rssPath('https://example.com/feed.xml'), AUTH, env);
    expect(res.status).toBe(502);
    expect(cache.size).toBe(0);
  });

  test('upstream network failure returns 502', async () => {
    const res = await app.request(rssPath('https://boom.example.com/feed.xml'), AUTH, env);
    expect(res.status).toBe(502);
  });
});
