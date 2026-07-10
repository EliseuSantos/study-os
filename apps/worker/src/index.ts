import { Hono } from 'hono';
import { bearerAuth } from './auth';
import type { Env } from './env';
import { handlePull, handlePush } from './sync';

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/health', (c) => c.json({ ok: true }));
  app.use('/sync/*', bearerAuth);
  app.post('/sync/push', handlePush);
  app.get('/sync/pull', handlePull);
  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
};
