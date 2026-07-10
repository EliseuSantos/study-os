import { d1Driver } from '@studyos/db/adapters/d1';
import type { DbDriver } from '@studyos/db';
import type { Handler } from 'hono';
import { cloneResponse, getCache } from './cache';
import type { Env } from './env';
import { isBlockedHost } from './proxy';

const CACHE_ORIGIN = 'https://cache.studyos';
const SERVICE = 'firecrawl';
const SEARCH_COST = 2; // 10 results = 2 credits on the free plan
const SCRAPE_COST = 1; // 1 page = 1 credit
const DEFAULT_MONTHLY_CREDITS = 1000;

/** UTC month key — the free plan resets monthly with no rollover. */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthlyLimit(env: Env): number {
  const raw = Number(env.FIRECRAWL_MONTHLY_CREDITS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MONTHLY_CREDITS;
}

/**
 * Charges `cost` credits against the current month, refusing beyond the limit.
 * The UPDATE carries its own `credits + n <= limit` guard, so a lost race under
 * the plan's 2-concurrent-request ceiling fails closed, never over-spends.
 */
async function chargeCredits(db: DbDriver, cost: number, limit: number): Promise<boolean> {
  const period = currentPeriod();
  await db.exec(
    'INSERT INTO proxy_usage (service, period, credits) VALUES (?, ?, 0) ' +
      'ON CONFLICT(service, period) DO NOTHING',
    [SERVICE, period],
  );
  const before = await db.exec(
    'SELECT credits FROM proxy_usage WHERE service = ? AND period = ?',
    [SERVICE, period],
  );
  const current = Number(before[0]?.['credits'] ?? 0);
  if (current + cost > limit) return false;
  await db.exec(
    'UPDATE proxy_usage SET credits = credits + ?3 ' +
      'WHERE service = ?1 AND period = ?2 AND credits + ?3 <= ?4',
    [SERVICE, period, cost, limit],
  );
  const after = await db.exec('SELECT credits FROM proxy_usage WHERE service = ? AND period = ?', [
    SERVICE,
    period,
  ]);
  return Number(after[0]?.['credits'] ?? 0) >= current + cost;
}

interface FirecrawlSearchUpstream {
  data?: { web?: { url?: string; title?: string; description?: string }[] };
}

/** Frozen wire format: { items: { url, title, description }[] }. */
interface WebSearchItem {
  url: string;
  title: string;
  description: string | null;
}

export const handleFirecrawlSearch: Handler<{ Bindings: Env }> = async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  if (q === '') return c.json({ error: 'q query param is required' }, 400);
  const key = c.env.FIRECRAWL_API_KEY;
  if (key === undefined || key === '') {
    return c.json({ error: 'firecrawl not configured' }, 503);
  }

  const cache = await getCache();
  const cacheKey = new Request(
    `${CACHE_ORIGIN}/fc-search?q=${encodeURIComponent(q.toLowerCase())}`,
  );
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const allowed = await chargeCredits(d1Driver(c.env.DB), SEARCH_COST, monthlyLimit(c.env));
  if (!allowed) return c.json({ error: 'firecrawl monthly limit reached' }, 429);

  const upstream = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, limit: 10 }),
  });
  if (!upstream.ok) return c.json({ error: 'firecrawl upstream error' }, 502);

  const data = (await upstream.json()) as FirecrawlSearchUpstream;
  const items: WebSearchItem[] = [];
  for (const entry of data.data?.web ?? []) {
    if (!entry.url) continue;
    items.push({
      url: entry.url,
      title: entry.title?.trim() || entry.url,
      description: entry.description ?? null,
    });
  }

  const res = new Response(JSON.stringify({ items }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=21600', // 6h
    },
  });
  await cache.put(cacheKey, cloneResponse(res));
  return res;
};

interface FirecrawlScrapeUpstream {
  data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } };
}

export const handleFirecrawlScrape: Handler<{ Bindings: Env }> = async (c) => {
  const raw = c.req.query('url') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }
  if (target.protocol !== 'https:' || isBlockedHost(target.hostname)) {
    return c.json({ error: 'url not allowed' }, 400);
  }
  const key = c.env.FIRECRAWL_API_KEY;
  if (key === undefined || key === '') {
    return c.json({ error: 'firecrawl not configured' }, 503);
  }

  const cache = await getCache();
  const cacheKey = new Request(
    `${CACHE_ORIGIN}/fc-scrape?url=${encodeURIComponent(target.toString())}`,
  );
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const allowed = await chargeCredits(d1Driver(c.env.DB), SCRAPE_COST, monthlyLimit(c.env));
  if (!allowed) return c.json({ error: 'firecrawl monthly limit reached' }, 429);

  const upstream = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url: target.toString(), formats: ['markdown'], onlyMainContent: true }),
  });
  if (!upstream.ok) return c.json({ error: 'firecrawl upstream error' }, 502);

  const data = (await upstream.json()) as FirecrawlScrapeUpstream;
  const markdown = data.data?.markdown ?? '';
  if (markdown.trim() === '') return c.json({ error: 'no readable content' }, 502);

  const res = new Response(
    JSON.stringify({
      url: data.data?.metadata?.sourceURL ?? target.toString(),
      title: data.data?.metadata?.title ?? target.hostname,
      markdown,
    }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=604800', // 7d — articles rarely change
      },
    },
  );
  await cache.put(cacheKey, cloneResponse(res));
  return res;
};
