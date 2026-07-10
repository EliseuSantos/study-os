import { expect, test } from 'bun:test';
import {
  addChecklistItem,
  deleteChecklistItem,
  listChecklist,
  toggleChecklistItem,
} from '../src/repo/checklists';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('addChecklistItem defaults position to the next index and appends one oplog row', async () => {
  const db = await freshDb();
  const first = await addChecklistItem(db, DEVICE, {
    ref_kind: 'topic',
    ref_id: 'topic-1',
    title: 'ler capítulo 1',
  });
  const second = await addChecklistItem(db, DEVICE, {
    ref_kind: 'topic',
    ref_id: 'topic-1',
    title: 'resolver exercícios',
  });
  const elsewhere = await addChecklistItem(db, DEVICE, {
    ref_kind: 'topic',
    ref_id: 'topic-2',
    title: 'outro',
  });

  expect(first.position).toBe(0);
  expect(first.done).toBe(0);
  expect(second.position).toBe(1);
  expect(elsewhere.position).toBe(0);

  const items = await listChecklist(db, 'topic', 'topic-1');
  expect(items.map((i) => i.id)).toEqual([first.id, second.id]);

  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'checklist_items'")).length).toBe(3);
});

test('toggleChecklistItem flips done with a bumped updated_at and one more oplog row', async () => {
  const db = await freshDb();
  const item = await addChecklistItem(db, DEVICE, {
    ref_kind: 'card',
    ref_id: 'card-1',
    title: 'revisar',
  });

  await toggleChecklistItem(db, DEVICE, item.id, true);
  let rows = await db.exec('SELECT done, updated_at FROM checklist_items WHERE id = ?', [item.id]);
  expect(rows[0]?.['done']).toBe(1);
  expect(rows[0]?.['updated_at'] as number).toBeGreaterThan(item.updated_at);

  await toggleChecklistItem(db, DEVICE, item.id, false);
  rows = await db.exec('SELECT done FROM checklist_items WHERE id = ?', [item.id]);
  expect(rows[0]?.['done']).toBe(0);

  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'checklist_items'")).length).toBe(3);
});

test('deleteChecklistItem soft-deletes and hides the item from listChecklist', async () => {
  const db = await freshDb();
  const item = await addChecklistItem(db, DEVICE, {
    ref_kind: 'topic',
    ref_id: 'topic-1',
    title: 'remover',
  });

  await deleteChecklistItem(db, DEVICE, item.id);

  expect((await listChecklist(db, 'topic', 'topic-1')).length).toBe(0);
  const rows = await db.exec('SELECT deleted_at FROM checklist_items WHERE id = ?', [item.id]);
  expect(rows[0]?.['deleted_at']).not.toBeNull();
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'checklist_items'")).length).toBe(2);
});
