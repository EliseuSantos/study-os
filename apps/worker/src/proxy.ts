import type { Handler } from 'hono';
import { cloneResponse, getCache } from './cache';
import type { Env } from './env';

// Synthetic origin for Cache API keys — never fetched, just a stable namespace.
const CACHE_ORIGIN = 'https://cache.studyos';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{5,20}$/;

interface YoutubeSearchUpstream {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  }[];
}

/** Frozen wire format (specs/content-connectors.md). */
interface YoutubeSearchItem {
  id: string;
  title: string;
  channel: string;
  thumbnail: string | null;
  duration: string | null;
}

export const handleYoutubeSearch: Handler<{ Bindings: Env }> = async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  if (q === '') return c.json({ error: 'q query param is required' }, 400);
  const key = c.env.YOUTUBE_API_KEY;
  if (key === undefined || key === '') {
    return c.json({ error: 'youtube api not configured' }, 503);
  }

  const cache = await getCache();
  const cacheKey = new Request(
    `${CACHE_ORIGIN}/yt-search?q=${encodeURIComponent(q.toLowerCase())}`,
  );
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('q', q);
  url.searchParams.set('key', key);
  const upstream = await fetch(url.toString());
  if (!upstream.ok) return c.json({ error: 'youtube upstream error' }, 502);

  const data = (await upstream.json()) as YoutubeSearchUpstream;
  const items: YoutubeSearchItem[] = [];
  for (const item of data.items ?? []) {
    const id = item.id?.videoId;
    if (!id) continue;
    items.push({
      id,
      title: item.snippet?.title ?? '',
      channel: item.snippet?.channelTitle ?? '',
      thumbnail:
        item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      // the search endpoint has no contentDetails; duration would need an extra
      // videos.list call per page — deferred, the wire format allows null.
      duration: null,
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

export const handleYoutubeTranscript: Handler<{ Bindings: Env }> = async (c) => {
  const id = c.req.query('id') ?? '';
  if (!VIDEO_ID_RE.test(id)) return c.json({ error: 'invalid video id' }, 400);

  const cache = await getCache();
  const cacheKey = new Request(`${CACHE_ORIGIN}/yt-transcript?id=${id}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let xml: string | null = null;
  for (const lang of ['pt', 'en']) {
    const upstream = await fetch(`https://www.youtube.com/api/timedtext?v=${id}&lang=${lang}`);
    if (!upstream.ok) continue;
    const body = await upstream.text();
    if (body.trim() === '') continue; // youtube answers 200 with an empty body
    xml = body;
    break;
  }
  if (xml === null) return c.json({ error: 'transcript not found' }, 404);

  const res = new Response(xml, {
    headers: {
      'content-type': 'text/xml; charset=utf-8',
      'cache-control': 'public, max-age=86400', // 24h
    },
  });
  await cache.put(cacheKey, cloneResponse(res));
  return res;
};

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.endsWith('.internal')
  );
}

export const handleRss: Handler<{ Bindings: Env }> = async (c) => {
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

  const cache = await getCache();
  const cacheKey = new Request(`${CACHE_ORIGIN}/rss?url=${encodeURIComponent(target.toString())}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { signal: AbortSignal.timeout(5000) });
  } catch {
    return c.json({ error: 'upstream unreachable' }, 502);
  }
  if (!upstream.ok) return c.json({ error: 'upstream error' }, 502);

  const body = await upstream.arrayBuffer();
  const res = new Response(body, {
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'public, max-age=3600', // 1h
    },
  });
  await cache.put(cacheKey, cloneResponse(res));
  return res;
};
