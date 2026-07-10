import { Hono } from 'hono';
import { bearerAuth } from './auth';
import { handleCron } from './cron';
import type { Env } from './env';
import { handleFirecrawlScrape, handleFirecrawlSearch } from './firecrawl';
import { handleRss, handleYoutubeSearch, handleYoutubeTranscript } from './proxy';
import { handleSubscribe, handleVapidKey } from './push';
import { handleShareCreate, handleShareGet } from './share';
import { handlePull, handlePush } from './sync';

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/health', (c) => c.json({ ok: true }));
  app.use('/sync/*', bearerAuth);
  app.post('/sync/push', handlePush);
  app.get('/sync/pull', handlePull);
  app.use('/push/*', bearerAuth);
  app.post('/push/subscribe', handleSubscribe);
  app.get('/push/vapid', handleVapidKey);
  app.use('/proxy/*', bearerAuth);
  app.get('/proxy/youtube/search', handleYoutubeSearch);
  app.get('/proxy/youtube/transcript', handleYoutubeTranscript);
  app.get('/proxy/rss', handleRss);
  app.get('/proxy/firecrawl/search', handleFirecrawlSearch);
  app.get('/proxy/firecrawl/scrape', handleFirecrawlScrape);
  // GET /share/:id is PUBLIC (students import without a token); only the
  // teacher-side POST goes through bearer auth, mounted inline on its route.
  app.get('/share/:id', handleShareGet);
  app.post('/share', bearerAuth, handleShareCreate);
  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(
    _controller: unknown,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): void {
    ctx.waitUntil(handleCron(env));
  },
};
