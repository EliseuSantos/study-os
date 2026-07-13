import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setCacheForTesting, type CacheLike } from '../src/cache';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { createFakeD1 } from './fake-d1';
import { FakeR2 } from './fake-r2';

const TOKEN = 'test';
const AUTH = { authorization: `Bearer ${TOKEN}` };
const app = createApp();

class FakeCache implements CacheLike {
  private readonly store = new Map<string, Response>();
  async match(req: Request): Promise<Response | undefined> {
    return this.store.get(req.url);
  }
  async put(req: Request, res: Response): Promise<void> {
    this.store.set(req.url, res);
  }
  async delete(req: Request): Promise<boolean> {
    return this.store.delete(req.url);
  }
}

let env: Env;
let shareId: string;

async function publish(): Promise<string> {
  const snapshot = {
    format: 'studyos-track',
    version: 1,
    exported_at: 1000,
    track: { title: 'T', description: null, mode: 'schedule' },
    topics: [{ key: 0, parent_key: null, sid: 'sid-a', title: 'A', notes_md: null, position: 0 }],
    cards: [],
    lessons: [],
    lesson_items: [],
    content: [],
  };
  const res = await app.request(
    '/share',
    { method: 'POST', headers: AUTH, body: JSON.stringify(snapshot) },
    env,
  );
  return ((await res.json()) as { id: string }).id;
}

function post(anon: string, done: number, topics: Record<string, 0 | 1>) {
  return app.request(
    `/class/${shareId}/progress`,
    {
      method: 'POST',
      body: JSON.stringify({
        anon_id: anon.padEnd(20, 'x'),
        payload: { topics_done: done, topics_total: 4, week_minutes: 60, topics },
      }),
    },
    env,
  );
}

beforeEach(async () => {
  env = {
    DB: await createFakeD1(),
    SYNC_TOKEN: TOKEN,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SHARES: new FakeR2(),
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: '{}',
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
  setCacheForTesting(new FakeCache());
  shareId = await publish();
});

afterEach(() => {
  setCacheForTesting(null);
});

describe('class progress', () => {
  test('POST is public and LWW per anon device; unknown share 404s', async () => {
    expect((await post('a', 1, { 'sid-a': 0 })).status).toBe(200);
    expect((await post('a', 2, { 'sid-a': 1 })).status).toBe(200);
    const rows = await env.DB.prepare('SELECT * FROM class_progress').bind().all();
    expect(rows.results.length).toBe(1);

    const missing = await app.request(
      '/class/nao-existe/progress',
      { method: 'POST', body: JSON.stringify({ anon_id: 'x'.repeat(20), payload: { topics_done: 0, topics_total: 1, week_minutes: 0, topics: {} } }) },
      env,
    );
    expect(missing.status).toBe(404);
  });

  test('GET stays 204 under the k-floor, aggregates from 3 devices on', async () => {
    await post('a', 1, { 'sid-a': 0 });
    await post('b', 3, { 'sid-a': 1 });
    const thin = await app.request(`/class/${shareId}/progress`, { headers: AUTH }, env);
    expect(thin.status).toBe(204);

    await post('c', 2, { 'sid-a': 1 });
    const res = await app.request(`/class/${shareId}/progress`, { headers: AUTH }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      median_done: number;
      topics: { sid: string; done_ratio: number }[];
    };
    expect(body.count).toBe(3);
    expect(body.median_done).toBe(2);
    expect(body.topics).toEqual([{ sid: 'sid-a', done_ratio: 2 / 3 }]);
  });

  test('GET requires the bearer token', async () => {
    const res = await app.request(`/class/${shareId}/progress`, {}, env);
    expect(res.status).toBe(401);
  });
});
