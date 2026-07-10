import { expect, test } from 'bun:test';
import type { GoalRow } from '@studyos/shared';
import type { DbDriver, Row } from '../src/driver';
import { createGoal, listGoals } from '../src/repo/goals';
import { localWrite } from '../src/repo/oplog';
import { getOrCreateDeviceId } from '../src/repo/settings';
import { syncNow, type Transport } from '../src/sync/engine';
import { buildPullStmt, buildPushStmts, rowsToPull } from '../src/sync/server-core';
import { freshDb } from './load-migrations';

function serverTransport(server: DbDriver): Transport {
  return {
    async push(req) {
      await server.batch(buildPushStmts(req.ops));
      return { accepted: req.ops.length };
    },
    async pull(since, deviceId) {
      const stmt = buildPullStmt(since, deviceId);
      const rows = await server.exec(stmt.sql, stmt.params);
      return rowsToPull(rows, since);
    },
  };
}

interface World {
  a: DbDriver;
  b: DbDriver;
  devA: string;
  devB: string;
  transport: Transport;
}

async function makeWorld(): Promise<World> {
  const [a, b, server] = await Promise.all([freshDb(), freshDb(), freshDb()]);
  return {
    a,
    b,
    devA: await getOrCreateDeviceId(a),
    devB: await getOrCreateDeviceId(b),
    transport: serverTransport(server),
  };
}

async function goalTitle(db: DbDriver, id: string): Promise<unknown> {
  const rows = await db.exec('SELECT title FROM goals WHERE id = ?', [id]);
  return rows[0]?.['title'];
}

test('goal created on A appears on B after sync', async () => {
  const w = await makeWorld();
  const goal = await createGoal(w.a, w.devA, { title: 'shared goal' });

  await syncNow(w.a, w.transport);
  await syncNow(w.b, w.transport);

  const onB = await listGoals(w.b);
  expect(onB.length).toBe(1);
  expect(onB[0]?.id).toBe(goal.id);
  expect(onB[0]?.title).toBe('shared goal');
});

test('concurrent edits converge to the newer updated_at', async () => {
  const w = await makeWorld();
  const goal = await createGoal(w.a, w.devA, { title: 'orig' });
  await syncNow(w.a, w.transport);
  await syncNow(w.b, w.transport);

  const base = goal.updated_at;
  await localWrite(w.a, 'goals', { ...goal, title: 'from A', updated_at: base + 1 }, w.devA);
  await localWrite(w.b, 'goals', { ...goal, title: 'from B', updated_at: base + 2 }, w.devB);

  await syncNow(w.a, w.transport);
  await syncNow(w.b, w.transport);
  await syncNow(w.a, w.transport);

  expect(await goalTitle(w.a, goal.id)).toBe('from B');
  expect(await goalTitle(w.b, goal.id)).toBe('from B');
});

test('soft delete on A wins over an older edit on B', async () => {
  const w = await makeWorld();
  const goal = await createGoal(w.a, w.devA, { title: 'doomed' });
  await syncNow(w.a, w.transport);
  await syncNow(w.b, w.transport);

  const base = goal.updated_at;
  await localWrite(w.b, 'goals', { ...goal, title: 'B edit', updated_at: base + 5 }, w.devB);
  const deleteTs = base + 10;
  await localWrite(w.a, 'goals', { ...goal, deleted_at: deleteTs, updated_at: deleteTs }, w.devA);

  await syncNow(w.b, w.transport);
  await syncNow(w.a, w.transport);
  await syncNow(w.b, w.transport);

  expect((await listGoals(w.a)).length).toBe(0);
  expect((await listGoals(w.b)).length).toBe(0);
  for (const db of [w.a, w.b]) {
    const rows = await db.exec('SELECT deleted_at, updated_at FROM goals WHERE id = ?', [goal.id]);
    expect(rows[0]?.['deleted_at']).toBe(deleteTs);
    expect(rows[0]?.['updated_at']).toBe(deleteTs);
  }
});

async function snapshot(db: DbDriver): Promise<{ goals: Row[]; oplog: Row[] }> {
  return {
    goals: await db.exec('SELECT * FROM goals ORDER BY id'),
    oplog: await db.exec('SELECT * FROM oplog ORDER BY seq'),
  };
}

test('sync is idempotent: running syncNow twice changes nothing', async () => {
  const w = await makeWorld();
  await createGoal(w.a, w.devA, { title: 'stable' });
  await syncNow(w.a, w.transport);
  await syncNow(w.b, w.transport);
  await syncNow(w.a, w.transport);

  const beforeA = await snapshot(w.a);
  const beforeB = await snapshot(w.b);

  const r1 = await syncNow(w.a, w.transport);
  const r2 = await syncNow(w.b, w.transport);
  expect(r1.pushed).toBe(0);
  expect(r2.pushed).toBe(0);

  expect(await snapshot(w.a)).toEqual(beforeA);
  expect(await snapshot(w.b)).toEqual(beforeB);

  const goalsA = (await listGoals(w.a)).map((g: GoalRow) => g.title);
  const goalsB = (await listGoals(w.b)).map((g: GoalRow) => g.title);
  expect(goalsA).toEqual(['stable']);
  expect(goalsB).toEqual(['stable']);
});
