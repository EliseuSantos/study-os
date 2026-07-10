import { expect, test } from 'bun:test';
import { createReminder, deleteReminder, dueReminders, listReminders } from '../src/repo/reminders';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';
const NOW = Date.now();

test('createReminder writes the reminder and exactly one oplog row', async () => {
  const db = await freshDb();
  const reminder = await createReminder(db, DEVICE, {
    title: 'revisar redação',
    notify_at: NOW + 3_600_000,
  });

  expect(reminder.ref_kind).toBeNull();
  expect(reminder.rrule).toBeNull();

  const ops = await db.exec('SELECT * FROM oplog');
  expect(ops.length).toBe(1);
  expect(ops[0]?.['tbl']).toBe('reminders');
  expect(ops[0]?.['row_id']).toBe(reminder.id);
});

test('listReminders hides deleted and orders by notify_at', async () => {
  const db = await freshDb();
  const later = await createReminder(db, DEVICE, { title: 'depois', notify_at: NOW + 2000 });
  const sooner = await createReminder(db, DEVICE, { title: 'antes', notify_at: NOW + 1000 });
  const gone = await createReminder(db, DEVICE, { title: 'apagado', notify_at: NOW + 3000 });

  await deleteReminder(db, DEVICE, gone.id);

  const visible = await listReminders(db);
  expect(visible.map((r) => r.id)).toEqual([sooner.id, later.id]);
});

test('dueReminders returns notify_at <= now, excluding deleted', async () => {
  const db = await freshDb();
  const due = await createReminder(db, DEVICE, { title: 'vencido', notify_at: NOW - 1000 });
  const atBoundary = await createReminder(db, DEVICE, { title: 'agora', notify_at: NOW });
  await createReminder(db, DEVICE, { title: 'futuro', notify_at: NOW + 60_000 });
  const deleted = await createReminder(db, DEVICE, { title: 'apagado', notify_at: NOW - 2000 });
  await deleteReminder(db, DEVICE, deleted.id);

  const result = await dueReminders(db, NOW);
  expect(result.map((r) => r.id)).toEqual([due.id, atBoundary.id]);
});

test('deleteReminder soft-deletes and appends an oplog row', async () => {
  const db = await freshDb();
  const reminder = await createReminder(db, DEVICE, { title: 'remover', notify_at: NOW });

  await deleteReminder(db, DEVICE, reminder.id);

  const row = await db.exec('SELECT deleted_at FROM reminders WHERE id = ?', [reminder.id]);
  expect(row[0]?.['deleted_at']).not.toBeNull();
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(2);
});
