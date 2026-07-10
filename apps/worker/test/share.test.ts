import { parseSnapshot, snapshotHash } from '@studyos/core';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cloneResponse, setCacheForTesting, type CacheLike } from '../src/cache';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { createFakeD1 } from './fake-d1';
import { FakeR2 } from './fake-r2';

const TOKEN = 'test';
const app = createApp();
const AUTH = { authorization: `Bearer ${TOKEN}` };

// minimal valid snapshot per specs/track-snapshot.md
const SNAPSHOT = {
  format: 'studyos-track',
  version: 1,
  exported_at: 1_700_000_000_000,
  track: { title: 'ENEM linguagens', description: null, mode: 'schedule' },
  topics: [{ key: 1, parent_key: null, title: 'Interpretação', notes_md: null, position: 0 }],
  cards: [
    {
      topic_key: 1,
      kind: 'basic',
      front_md: 'O que é crônica?',
      back_md: 'Narrativa',
      options_json: null,
    },
  ],
  lessons: [
    { key: 1, title: 'Aula 1', presenter_notes_md: null, estimated_duration_min: 50, position: 0 },
  ],
  lesson_items: [{ lesson_key: 1, topic_key: 1, kind: 'topic', body_md: null, position: 0 }],
  content: [],
};
const SNAPSHOT_JSON = JSON.stringify(SNAPSHOT);

class FakeCache implements CacheLike {
  private readonly store = new Map<string, Response>();

  async match(req: Request): Promise<Response | undefined> {
    const res = this.store.get(req.url);
    return res === undefined ? undefined : cloneResponse(res);
  }

  async put(req: Request, res: Response): Promise<void> {
    this.store.set(req.url, res);
  }

  get size(): number {
    return this.store.size;
  }
}

let env: Env;
let r2: FakeR2;
let cache: FakeCache;

beforeEach(async () => {
  r2 = new FakeR2();
  env = {
    DB: await createFakeD1(),
    SYNC_TOKEN: TOKEN,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SHARES: r2,
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: '{}',
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
  cache = new FakeCache();
  setCacheForTesting(cache);
});

afterEach(() => {
  setCacheForTesting(null);
});

describe('POST /share', () => {
  test('requires the bearer token', async () => {
    const res = await app.request('/share', { method: 'POST', body: SNAPSHOT_JSON }, env);
    expect(res.status).toBe(401);
    expect(r2.size).toBe(0);
  });

  test('invalid snapshot returns 400', async () => {
    for (const body of ['not json', '{}', JSON.stringify({ ...SNAPSHOT, format: 'other' })]) {
      const res = await app.request('/share', { method: 'POST', headers: AUTH, body }, env);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid snapshot' });
    }
    expect(r2.size).toBe(0);
  });

  test('bodies over 1 MB return 413', async () => {
    const res = await app.request(
      '/share',
      { method: 'POST', headers: AUTH, body: 'x'.repeat(1_048_577) },
      env,
    );
    expect(res.status).toBe(413);
    expect(r2.size).toBe(0);
  });

  test('stores the gzipped snapshot and a track_shares row', async () => {
    const res = await app.request(
      '/share',
      { method: 'POST', headers: AUTH, body: SNAPSHOT_JSON },
      env,
    );
    expect(res.status).toBe(200);

    const { id, hash } = (await res.json()) as { id: string; hash: string };
    expect(id).toMatch(/^[0-9a-f]{14}$/);
    expect(hash).toBe(snapshotHash(parseSnapshot(SNAPSHOT_JSON)));
    expect(id.slice(0, 10)).toBe(hash.slice(0, 10));
    expect(r2.keys()).toEqual([`shares/${id}.json.gz`]);

    const rows = await env.DB.prepare('SELECT * FROM track_shares').bind().all();
    expect(rows.results.length).toBe(1);
    expect(rows.results[0]?.['id']).toBe(id);
    expect(rows.results[0]?.['version_hash']).toBe(hash);
    expect(rows.results[0]?.['r2_key']).toBe(`shares/${id}.json.gz`);
    expect(rows.results[0]?.['title']).toBe('ENEM linguagens');
  });
});

describe('GET /share/:id', () => {
  test('roundtrip: a shared snapshot comes back identical, without auth', async () => {
    const post = await app.request(
      '/share',
      { method: 'POST', headers: AUTH, body: SNAPSHOT_JSON },
      env,
    );
    const { id, hash } = (await post.json()) as { id: string; hash: string };

    // no auth header on purpose: the route is public for students
    const res = await app.request(`/share/${id}`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await res.json()).toEqual({ snapshot: SNAPSHOT, hash });
  });

  test('unknown id returns 404', async () => {
    const res = await app.request('/share/00000000000000', {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'share not found' });
  });

  test('second call is served from cache without touching R2', async () => {
    const post = await app.request(
      '/share',
      { method: 'POST', headers: AUTH, body: SNAPSHOT_JSON },
      env,
    );
    const { id } = (await post.json()) as { id: string };

    const first = await app.request(`/share/${id}`, {}, env);
    expect(r2.getCalls).toBe(1);
    expect(cache.size).toBe(1);

    const second = await app.request(`/share/${id}`, {}, env);
    expect(r2.getCalls).toBe(1);
    expect(await second.json()).toEqual(await first.json());
  });
});
