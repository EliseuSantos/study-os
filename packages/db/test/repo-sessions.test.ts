import { expect, test } from 'bun:test';
import { finishSession, listRecentSessions, startSession } from '../src/repo/sessions';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('startSession initializes the row and appends one oplog row', async () => {
  const db = await freshDb();
  const session = await startSession(db, DEVICE, { type: 'study' });

  expect(session.started_at).toBeGreaterThan(0);
  expect(session.ended_at).toBeNull();
  expect(session.net_seconds).toBe(0);
  expect(session.focused).toBe(0);

  const rows = await db.exec('SELECT * FROM sessions');
  expect(rows.length).toBe(1);
  expect(rows[0]?.['type']).toBe('study');

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'sessions'");
  expect(ops.length).toBe(1);
  expect(ops[0]?.['row_id']).toBe(session.id);
});

test('finishSession patches with bumpedTs and appends a second oplog row', async () => {
  const db = await freshDb();
  const session = await startSession(db, DEVICE, { type: 'questions' });

  const ended = Date.now() + 1_500_000;
  const finished = await finishSession(db, DEVICE, session.id, {
    ended_at: ended,
    net_seconds: 1500,
    questions_total: 20,
    questions_correct: 17,
    notes: 'boa sessão',
  });

  expect(finished).not.toBeNull();
  expect(finished?.ended_at).toBe(ended);
  expect(finished?.net_seconds).toBe(1500);
  expect(finished?.questions_correct).toBe(17);
  expect(finished?.updated_at ?? 0).toBeGreaterThan(session.updated_at);

  const rows = await db.exec('SELECT * FROM sessions WHERE id = ?', [session.id]);
  expect(rows[0]?.['net_seconds']).toBe(1500);
  expect(rows[0]?.['notes']).toBe('boa sessão');
  expect((await db.exec("SELECT * FROM oplog WHERE tbl = 'sessions'")).length).toBe(2);
});

test('finishSession returns null for unknown sessions', async () => {
  const db = await freshDb();
  expect(
    await finishSession(db, DEVICE, 'nope', { ended_at: Date.now(), net_seconds: 1 }),
  ).toBeNull();
});

test('listRecentSessions orders by started_at desc and respects the limit', async () => {
  const db = await freshDb();
  const a = await startSession(db, DEVICE, { type: 'study' });
  await db.exec('UPDATE sessions SET started_at = started_at - 10000 WHERE id = ?', [a.id]);
  const b = await startSession(db, DEVICE, { type: 'video' });
  const c = await startSession(db, DEVICE, { type: 'reading' });
  await db.exec('UPDATE sessions SET started_at = started_at + 10000 WHERE id = ?', [c.id]);

  const recent = await listRecentSessions(db);
  expect(recent.map((s) => s.id)).toEqual([c.id, b.id, a.id]);

  expect((await listRecentSessions(db, 2)).map((s) => s.id)).toEqual([c.id, b.id]);
});
