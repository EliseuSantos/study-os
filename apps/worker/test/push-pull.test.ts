import type { OpLogEntry, PullResponse, PushResponse } from '@studyos/shared';
import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../src/index';
import type { Env } from '../src/env';
import { createFakeD1, type FakeD1 } from './fake-d1';
import { FakeR2 } from './fake-r2';

const TOKEN = 'test';
const app = createApp();

let db: FakeD1;
let env: Env;

beforeEach(async () => {
  db = await createFakeD1();
  env = {
    DB: db,
    SYNC_TOKEN: TOKEN,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SHARES: new FakeR2(),
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: '{}',
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
});

function goalOp(overrides: Partial<OpLogEntry> & { row_id: string }, title = 'Goal'): OpLogEntry {
  const updated_at = overrides.updated_at ?? 1000;
  const base: OpLogEntry = {
    tbl: 'goals',
    row_id: overrides.row_id,
    op: 'upsert',
    payload: JSON.stringify({
      id: overrides.row_id,
      title,
      description: null,
      target_date: null,
      status: 'active',
      created_at: 500,
      updated_at,
      deleted_at: null,
    }),
    updated_at,
    device_id: 'device-a',
  };
  return { ...base, ...overrides };
}

async function push(ops: OpLogEntry[], deviceId = 'device-a'): Promise<Response> {
  return app.request(
    '/sync/push',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ device_id: deviceId, ops }),
    },
    env,
  );
}

async function pull(since: number, device: string): Promise<Response> {
  return app.request(
    `/sync/pull?since=${since}&device=${device}`,
    { headers: { authorization: `Bearer ${TOKEN}` } },
    env,
  );
}

async function queryAll(sql: string): Promise<Record<string, unknown>[]> {
  const { results } = await db.prepare(sql).bind().all();
  return results;
}

describe('POST /sync/push', () => {
  test('inserts entity row and server_oplog entry', async () => {
    const res = await push([goalOp({ row_id: 'g1' }, 'Learn D1')]);
    expect(res.status).toBe(200);
    expect((await res.json()) as PushResponse).toEqual({ accepted: 1 });

    const goals = await queryAll('SELECT * FROM goals');
    expect(goals).toHaveLength(1);
    expect(goals[0]?.['id']).toBe('g1');
    expect(goals[0]?.['title']).toBe('Learn D1');

    const oplog = await queryAll('SELECT * FROM server_oplog');
    expect(oplog).toHaveLength(1);
    expect(oplog[0]?.['row_id']).toBe('g1');
    expect(oplog[0]?.['updated_at']).toBe(1000);
  });

  test('older op loses (LWW)', async () => {
    await push([goalOp({ row_id: 'g1', updated_at: 2000 }, 'Newer')]);
    await push([goalOp({ row_id: 'g1', updated_at: 1000 }, 'Older')]);

    const goals = await queryAll('SELECT * FROM goals');
    expect(goals).toHaveLength(1);
    expect(goals[0]?.['title']).toBe('Newer');

    const oplog = await queryAll('SELECT * FROM server_oplog');
    expect(oplog[0]?.['updated_at']).toBe(2000);
  });

  test('unknown table returns 400', async () => {
    const res = await push([goalOp({ row_id: 'x1', tbl: 'not_a_table' })]);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('unknown synced table');
  });

  test('malformed body returns 400', async () => {
    const cases: unknown[] = [
      { device_id: 'device-a' },
      { device_id: 'device-a', ops: 'nope' },
      { device_id: 42, ops: [] },
      { device_id: 'device-a', ops: [{ tbl: 'goals' }] },
      {
        device_id: 'device-a',
        ops: [
          {
            tbl: 'goals',
            row_id: 'g1',
            op: 'merge',
            payload: '{}',
            updated_at: 1,
            device_id: 'device-a',
          },
        ],
      },
    ];
    for (const body of cases) {
      const res = await app.request(
        '/sync/push',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${TOKEN}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        env,
      );
      expect(res.status).toBe(400);
    }

    const notJson = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
        },
        body: 'not json',
      },
      env,
    );
    expect(notJson.status).toBe(400);
  });
});

describe('GET /sync/pull', () => {
  test('excludes ops from the calling device', async () => {
    await push([goalOp({ row_id: 'g1', device_id: 'device-a' })]);
    await push([goalOp({ row_id: 'g2', device_id: 'device-b', updated_at: 1500 })], 'device-b');

    const res = await pull(0, 'device-a');
    expect(res.status).toBe(200);
    const body = (await res.json()) as PullResponse;
    expect(body.ops).toHaveLength(1);
    expect(body.ops[0]?.row_id).toBe('g2');
    expect(body.ops[0]?.device_id).toBe('device-b');
  });

  test('respects since with >= semantics', async () => {
    await push([goalOp({ row_id: 'g1', updated_at: 1000 })]);

    const atBoundary = (await (await pull(1000, 'device-z')).json()) as PullResponse;
    expect(atBoundary.ops).toHaveLength(1);
    expect(atBoundary.cursor).toBe(1000);

    const past = (await (await pull(1001, 'device-z')).json()) as PullResponse;
    expect(past.ops).toHaveLength(0);
    expect(past.cursor).toBe(1001);
  });

  test('paginates with has_more', async () => {
    const total = 501;
    for (let i = 0; i < total; i++) {
      await db
        .prepare(
          'INSERT INTO server_oplog (tbl,row_id,op,payload,updated_at,device_id) VALUES (?,?,?,?,?,?)',
        )
        .bind('goals', `g${i}`, 'upsert', '{}', 1000 + i, 'device-a')
        .run();
    }

    const first = (await (await pull(0, 'device-z')).json()) as PullResponse;
    expect(first.ops).toHaveLength(500);
    expect(first.has_more).toBe(true);
    expect(first.cursor).toBe(1000 + 499);

    const second = (await (await pull(first.cursor + 1, 'device-z')).json()) as PullResponse;
    expect(second.ops).toHaveLength(1);
    expect(second.has_more).toBe(false);
  });

  test('push then pull roundtrip preserves payload exactly', async () => {
    const op = goalOp({ row_id: 'g1', updated_at: 1234 }, 'Exact payload');
    await push([op]);

    const body = (await (await pull(0, 'device-z')).json()) as PullResponse;
    expect(body.ops).toHaveLength(1);
    expect(body.ops[0]).toEqual(op);
  });

  test('requires device query param', async () => {
    const res = await app.request(
      '/sync/pull?since=0',
      { headers: { authorization: `Bearer ${TOKEN}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  test('defaults since to 0', async () => {
    await push([goalOp({ row_id: 'g1' })]);
    const res = await app.request(
      '/sync/pull?device=device-z',
      { headers: { authorization: `Bearer ${TOKEN}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as PullResponse;
    expect(body.ops).toHaveLength(1);
  });
});
