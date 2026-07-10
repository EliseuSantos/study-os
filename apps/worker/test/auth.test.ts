import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../src/index';
import type { Env } from '../src/env';
import { createFakeD1 } from './fake-d1';

const TOKEN = 'test';
const app = createApp();

let env: Env;

beforeEach(async () => {
  env = {
    DB: await createFakeD1(),
    SYNC_TOKEN: TOKEN,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: '{}',
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
});

describe('auth', () => {
  test('missing Authorization header returns 401', async () => {
    const res = await app.request('/sync/pull?device=d1', {}, env);
    expect(res.status).toBe(401);
    expect((await res.json()) as { error: string }).toEqual({ error: 'unauthorized' });
  });

  test('wrong token returns 401', async () => {
    const res = await app.request(
      '/sync/pull?device=d1',
      { headers: { authorization: 'Bearer wrong-token' } },
      env,
    );
    expect(res.status).toBe(401);
  });

  test('non-bearer scheme returns 401', async () => {
    const res = await app.request(
      '/sync/pull?device=d1',
      { headers: { authorization: `Basic ${TOKEN}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  test('correct token returns 200', async () => {
    const res = await app.request(
      '/sync/pull?device=d1',
      { headers: { authorization: `Bearer ${TOKEN}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  test('health endpoint needs no auth', async () => {
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
  });
});
