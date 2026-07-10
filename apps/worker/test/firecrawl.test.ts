import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cloneResponse, setCacheForTesting, type CacheLike } from '../src/cache';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { createFakeD1, type FakeD1 } from './fake-d1';
import { FakeR2 } from './fake-r2';

const TOKEN = 'test';
const app = createApp();
const AUTH = { headers: { authorization: `Bearer ${TOKEN}` } };

const SEARCH_FIXTURE = {
  success: true,
  data: {
    web: [
      {
        url: 'https://exemplo.com/controle-difuso',
        title: 'Controle difuso de constitucionalidade',
        description: 'Panorama do controle difuso no Brasil.',
      },
      { url: 'https://outro.com/artigo', title: '  ', description: null },
      { title: 'sem url — deve ser pulado' },
    ],
  },
};

const SCRAPE_FIXTURE = {
  success: true,
  data: {
    markdown: '# Controle difuso\n\nO controle difuso permite que qualquer juiz...',
    metadata: { title: 'Controle difuso', sourceURL: 'https://exemplo.com/controle-difuso' },
  },
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
}

const realFetch = globalThis.fetch;
let fetchCalls: { url: string; init?: RequestInit }[] = [];
let fetchResponder: (url: string) => Response;

let db: FakeD1;
let env: Env;

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    SYNC_TOKEN: TOKEN,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SHARES: new FakeR2(),
    VAPID_PUBLIC_KEY: 'pk',
    VAPID_PRIVATE_KEY: '{}',
    VAPID_SUBJECT: 'mailto:t@example.com',
    FIRECRAWL_API_KEY: 'fc-test-key',
    ...overrides,
  };
}

async function usedCredits(): Promise<number> {
  const row = await db
    .prepare("SELECT credits FROM proxy_usage WHERE service = 'firecrawl'")
    .first();
  return Number(row?.['credits'] ?? 0);
}

beforeEach(async () => {
  db = await createFakeD1();
  env = makeEnv();
  setCacheForTesting(new FakeCache());
  fetchCalls = [];
  fetchResponder = () => new Response('not stubbed', { status: 500 });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    fetchCalls.push({ url, ...(init === undefined ? {} : { init }) });
    return fetchResponder(url);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setCacheForTesting(null);
});

describe('/proxy/firecrawl/search', () => {
  test('requires auth', async () => {
    const res = await app.request('/proxy/firecrawl/search?q=x', {}, env);
    expect(res.status).toBe(401);
  });

  test('400 without q, 503 without key', async () => {
    expect((await app.request('/proxy/firecrawl/search?q=', AUTH, env)).status).toBe(400);
    const noKey = makeEnv();
    delete noKey.FIRECRAWL_API_KEY;
    expect((await app.request('/proxy/firecrawl/search?q=x', AUTH, noKey)).status).toBe(503);
  });

  test('maps upstream to the frozen wire format and charges 2 credits', async () => {
    fetchResponder = () => Response.json(SEARCH_FIXTURE);
    const res = await app.request('/proxy/firecrawl/search?q=Controle+Difuso', AUTH, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { url: string; title: string }[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.title).toBe('Controle difuso de constitucionalidade');
    expect(body.items[1]?.title).toBe('https://outro.com/artigo');
    expect(fetchCalls[0]?.url).toBe('https://api.firecrawl.dev/v2/search');
    expect(await usedCredits()).toBe(2);
  });

  test('cache hit skips fetch and charges nothing', async () => {
    fetchResponder = () => Response.json(SEARCH_FIXTURE);
    await app.request('/proxy/firecrawl/search?q=cache-me', AUTH, env);
    const second = await app.request('/proxy/firecrawl/search?q=CACHE-ME', AUTH, env);
    expect(second.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(await usedCredits()).toBe(2);
  });

  test('429 at the monthly limit without calling the api', async () => {
    fetchResponder = () => Response.json(SEARCH_FIXTURE);
    const tight = makeEnv({ FIRECRAWL_MONTHLY_CREDITS: '3' });
    expect((await app.request('/proxy/firecrawl/search?q=um', AUTH, tight)).status).toBe(200);
    const blocked = await app.request('/proxy/firecrawl/search?q=dois', AUTH, tight);
    expect(blocked.status).toBe(429);
    expect(fetchCalls).toHaveLength(1);
    expect(await usedCredits()).toBe(2);
  });

  test('a new month starts from zero', async () => {
    fetchResponder = () => Response.json(SEARCH_FIXTURE);
    await db
      .prepare("INSERT INTO proxy_usage (service, period, credits) VALUES ('firecrawl', '2020-01', 1000)")
      .run();
    const res = await app.request('/proxy/firecrawl/search?q=novo-mes', AUTH, env);
    expect(res.status).toBe(200);
    expect(await usedCredits()).toBe(1000); // old period untouched; current period holds 2
    const current = await db
      .prepare("SELECT credits FROM proxy_usage WHERE service = 'firecrawl' AND period != '2020-01'")
      .first();
    expect(Number(current?.['credits'])).toBe(2);
  });

  test('502 on upstream failure', async () => {
    fetchResponder = () => new Response('nope', { status: 500 });
    const res = await app.request('/proxy/firecrawl/search?q=erro', AUTH, env);
    expect(res.status).toBe(502);
  });
});

describe('/proxy/firecrawl/scrape', () => {
  test('validates url: https only, private hosts blocked', async () => {
    for (const bad of [
      'not-a-url',
      'http://exemplo.com/a',
      'https://localhost/x',
      'https://192.168.1.10/x',
      'https://api.internal/x',
    ]) {
      const res = await app.request(
        `/proxy/firecrawl/scrape?url=${encodeURIComponent(bad)}`,
        AUTH,
        env,
      );
      expect(res.status).toBe(400);
    }
  });

  test('scrapes, charges 1 credit and caches for a week', async () => {
    fetchResponder = () => Response.json(SCRAPE_FIXTURE);
    const target = encodeURIComponent('https://exemplo.com/controle-difuso');
    const res = await app.request(`/proxy/firecrawl/scrape?url=${target}`, AUTH, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; markdown: string };
    expect(body.title).toBe('Controle difuso');
    expect(body.markdown).toContain('# Controle difuso');
    expect(res.headers.get('cache-control')).toContain('604800');
    expect(await usedCredits()).toBe(1);

    const again = await app.request(`/proxy/firecrawl/scrape?url=${target}`, AUTH, env);
    expect(again.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(await usedCredits()).toBe(1);
  });

  test('502 when the page has no readable content', async () => {
    fetchResponder = () => Response.json({ success: true, data: { markdown: '   ' } });
    const res = await app.request(
      `/proxy/firecrawl/scrape?url=${encodeURIComponent('https://exemplo.com/vazio')}`,
      AUTH,
      env,
    );
    expect(res.status).toBe(502);
  });
});
