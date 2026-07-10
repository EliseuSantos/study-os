import { expect, test } from 'bun:test';
import { createGoal, deleteGoal, listGoals, updateGoal } from '../src/repo/goals';
import { localWrite } from '../src/repo/oplog';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('createGoal writes the goal and exactly one oplog row', async () => {
  const db = await freshDb();
  const goal = await createGoal(db, DEVICE, { title: 'Pass the exam' });

  const goals = await db.exec('SELECT * FROM goals');
  expect(goals.length).toBe(1);
  expect(goals[0]?.['title']).toBe('Pass the exam');
  expect(goals[0]?.['status']).toBe('active');

  const ops = await db.exec('SELECT * FROM oplog');
  expect(ops.length).toBe(1);
  expect(ops[0]?.['tbl']).toBe('goals');
  expect(ops[0]?.['row_id']).toBe(goal.id);
  expect(ops[0]?.['op']).toBe('upsert');
  expect(ops[0]?.['synced']).toBe(0);
  expect(JSON.parse(ops[0]?.['payload'] as string)).toEqual({ ...goal });
});

test('localWrite is atomic: a failing oplog insert rolls back the entity write', async () => {
  const db = await freshDb();
  const ts = Date.now();
  const goal = {
    id: 'g-atomic',
    title: 'doomed',
    description: null,
    target_date: null,
    status: 'active',
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  // null device_id violates oplog NOT NULL after the goal insert succeeded
  await expect(localWrite(db, 'goals', goal, null as unknown as string)).rejects.toThrow();

  expect((await db.exec('SELECT * FROM goals')).length).toBe(0);
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(0);
});

test('listGoals hides soft-deleted goals and orders newest first', async () => {
  const db = await freshDb();
  const a = await createGoal(db, DEVICE, { title: 'keep' });
  const b = await createGoal(db, DEVICE, { title: 'remove' });

  await deleteGoal(db, DEVICE, b.id);

  const visible = await listGoals(db);
  expect(visible.length).toBe(1);
  expect(visible[0]?.id).toBe(a.id);

  const all = await db.exec('SELECT deleted_at FROM goals WHERE id = ?', [b.id]);
  expect(all[0]?.['deleted_at']).not.toBeNull();
});

test('updateGoal bumps updated_at and appends a second oplog row', async () => {
  const db = await freshDb();
  const goal = await createGoal(db, DEVICE, { title: 'before' });

  const updated = await updateGoal(db, DEVICE, goal.id, { title: 'after' });
  expect(updated).not.toBeNull();
  expect(updated?.title).toBe('after');
  expect(updated?.updated_at).toBeGreaterThan(goal.updated_at);

  const rows = await db.exec('SELECT title, updated_at FROM goals WHERE id = ?', [goal.id]);
  expect(rows[0]?.['title']).toBe('after');
  expect(rows[0]?.['updated_at']).toBe(updated?.updated_at ?? -1);

  expect((await db.exec('SELECT * FROM oplog')).length).toBe(2);
});

test('updateGoal returns null for missing or deleted goals', async () => {
  const db = await freshDb();
  expect(await updateGoal(db, DEVICE, 'nope', { title: 'x' })).toBeNull();

  const goal = await createGoal(db, DEVICE, { title: 'gone' });
  await deleteGoal(db, DEVICE, goal.id);
  expect(await updateGoal(db, DEVICE, goal.id, { title: 'x' })).toBeNull();
});
