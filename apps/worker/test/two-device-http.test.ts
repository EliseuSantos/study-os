import { createGoal, listGoals, migrate, syncNow, updateGoal, type Transport } from '@studyos/db';
import { bunSqliteDriver } from '@studyos/db/adapters/bun-sqlite';
import type { DbDriver } from '@studyos/db';
import type { PullResponse, PushRequest, PushResponse } from '@studyos/shared';
import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { createFakeD1 } from './fake-d1';
import { FakeR2 } from './fake-r2';

const TOKEN = 'test';
const app = createApp();

const MIGRATIONS_DIR = new URL('../../../packages/db/migrations/', import.meta.url).pathname;

async function createLocalDb(): Promise<DbDriver> {
  const driver = bunSqliteDriver(new Database(':memory:'));
  // full migration chain: the client schema must match current repos
  const glob = new Bun.Glob('*.sql');
  const files = [...glob.scanSync(MIGRATIONS_DIR)].toSorted();
  const migrations = await Promise.all(
    files.map(async (file, i) => ({
      version: i + 1,
      sql: await Bun.file(`${MIGRATIONS_DIR}${file}`).text(),
    })),
  );
  await migrate(driver, migrations);
  return driver;
}

function httpTransport(env: Env): Transport {
  const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
  return {
    async push(req: PushRequest): Promise<PushResponse> {
      const res = await app.request(
        '/sync/push',
        { method: 'POST', headers, body: JSON.stringify(req) },
        env,
      );
      expect(res.status).toBe(200);
      return (await res.json()) as PushResponse;
    },
    async pull(since: number, deviceId: string): Promise<PullResponse> {
      const res = await app.request(
        `/sync/pull?since=${since}&device=${encodeURIComponent(deviceId)}`,
        { headers },
        env,
      );
      expect(res.status).toBe(200);
      return (await res.json()) as PullResponse;
    },
  };
}

describe('two devices syncing through the real HTTP app', () => {
  let env: Env;
  let transport: Transport;
  let dbA: DbDriver;
  let dbB: DbDriver;

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
    transport = httpTransport(env);
    dbA = await createLocalDb();
    dbB = await createLocalDb();
  });

  test('goal created on A appears on B after both sync', async () => {
    await createGoal(dbA, 'device-a', { title: 'pass the bar exam' });
    await syncNow(dbA, transport);
    await syncNow(dbB, transport);

    const goals = await listGoals(dbB);
    expect(goals).toHaveLength(1);
    expect(goals[0]?.title).toBe('pass the bar exam');
  });

  test('concurrent edits converge to the newest write on both devices', async () => {
    const goal = await createGoal(dbA, 'device-a', { title: 'original' });
    await syncNow(dbA, transport);
    await syncNow(dbB, transport);

    await updateGoal(dbA, 'device-a', goal.id, { title: 'edit from A' });
    await Bun.sleep(2);
    await updateGoal(dbB, 'device-b', goal.id, { title: 'edit from B' });

    await syncNow(dbA, transport);
    await syncNow(dbB, transport);
    await syncNow(dbA, transport);

    const [goalsA, goalsB] = await Promise.all([listGoals(dbA), listGoals(dbB)]);
    expect(goalsA[0]?.title).toBe('edit from B');
    expect(goalsB[0]?.title).toBe('edit from B');
  });

  test('repeated sync is idempotent', async () => {
    await createGoal(dbA, 'device-a', { title: 'stable' });
    await syncNow(dbA, transport);
    await syncNow(dbB, transport);
    const first = await listGoals(dbB);

    await syncNow(dbB, transport);
    await syncNow(dbB, transport);
    const after = await listGoals(dbB);

    expect(after).toEqual(first);
  });
});
