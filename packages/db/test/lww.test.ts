import { expect, test } from 'bun:test';
import { lwwUpsertStmt } from '../src/helpers';
import type { DbDriver } from '../src/driver';
import { freshDb } from './load-migrations';

function goalRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'g1',
    title: 'base',
    description: null,
    target_date: null,
    status: 'active',
    created_at: 100,
    updated_at: 100,
    deleted_at: null,
    ...overrides,
  };
}

async function apply(db: DbDriver, row: Record<string, unknown>): Promise<void> {
  const stmt = lwwUpsertStmt('goals', row);
  await db.exec(stmt.sql, stmt.params);
}

async function titleAndTs(db: DbDriver): Promise<{ title: unknown; updated_at: unknown }> {
  const rows = await db.exec('SELECT title, updated_at FROM goals WHERE id = ?', ['g1']);
  return { title: rows[0]?.['title'], updated_at: rows[0]?.['updated_at'] };
}

test('older updated_at loses', async () => {
  const db = await freshDb();
  await apply(db, goalRow({ title: 'current', updated_at: 100 }));
  await apply(db, goalRow({ title: 'stale', updated_at: 50 }));
  expect(await titleAndTs(db)).toEqual({ title: 'current', updated_at: 100 });
});

test('newer updated_at wins', async () => {
  const db = await freshDb();
  await apply(db, goalRow({ title: 'current', updated_at: 100 }));
  await apply(db, goalRow({ title: 'fresh', updated_at: 200 }));
  expect(await titleAndTs(db)).toEqual({ title: 'fresh', updated_at: 200 });
});

test('equal updated_at re-apply is a no-op (idempotent)', async () => {
  const db = await freshDb();
  await apply(db, goalRow({ title: 'current', updated_at: 100 }));
  await apply(db, goalRow({ title: 'tied', updated_at: 100 }));
  expect(await titleAndTs(db)).toEqual({ title: 'current', updated_at: 100 });

  await apply(db, goalRow({ title: 'current', updated_at: 100 }));
  expect(await titleAndTs(db)).toEqual({ title: 'current', updated_at: 100 });
  expect((await db.exec('SELECT count(*) AS n FROM goals'))[0]?.['n']).toBe(1);
});

test('unknown table is rejected', () => {
  expect(() => lwwUpsertStmt('settings', { id: 'x' })).toThrow('unknown synced table');
});
