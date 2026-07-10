import { expect, test } from 'bun:test';
import { SETTINGS_KEYS, type PullResponse } from '@studyos/shared';
import { applyPullPage } from '../src/sync/apply';
import { getSetting } from '../src/repo/settings';
import { freshDb } from './load-migrations';

test('applyPullPage applies ops, advances the cursor and writes zero oplog rows', async () => {
  const db = await freshDb();
  const goal = {
    id: 'g-remote',
    title: 'from another device',
    description: null,
    target_date: null,
    status: 'active',
    created_at: 1000,
    updated_at: 1000,
    deleted_at: null,
  };
  const page: PullResponse = {
    ops: [
      {
        tbl: 'goals',
        row_id: goal.id,
        op: 'upsert',
        payload: JSON.stringify(goal),
        updated_at: goal.updated_at,
        device_id: 'device-remote',
      },
    ],
    cursor: 1000,
    has_more: false,
  };

  await applyPullPage(db, page);

  const goals = await db.exec('SELECT * FROM goals');
  expect(goals.length).toBe(1);
  expect(goals[0]?.['title']).toBe('from another device');

  expect(await getSetting(db, SETTINGS_KEYS.syncCursor)).toBe('1000');
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(0);
});

test('applyPullPage with an empty page still advances the cursor', async () => {
  const db = await freshDb();
  await applyPullPage(db, { ops: [], cursor: 42, has_more: false });
  expect(await getSetting(db, SETTINGS_KEYS.syncCursor)).toBe('42');
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(0);
});
