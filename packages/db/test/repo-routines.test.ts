import { expect, test } from 'bun:test';
import {
  createRoutine,
  deleteRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
} from '../src/repo/routines';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('createRoutine writes the routine and exactly one oplog row', async () => {
  const db = await freshDb();
  const routine = await createRoutine(db, DEVICE, {
    title: 'matemática de manhã',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    start_time: '07:30',
    duration_min: 60,
  });

  expect(routine.active).toBe(1);
  expect(routine.track_id).toBeNull();
  expect(await getRoutine(db, routine.id)).toEqual(routine);

  const ops = await db.exec('SELECT * FROM oplog');
  expect(ops.length).toBe(1);
  expect(ops[0]?.['tbl']).toBe('routines');
  expect(ops[0]?.['row_id']).toBe(routine.id);
  expect(ops[0]?.['op']).toBe('upsert');
});

test('listRoutines hides deleted and inactive routines, ordered by start_time', async () => {
  const db = await freshDb();
  const late = await createRoutine(db, DEVICE, {
    title: 'noite',
    rrule: 'FREQ=WEEKLY;BYDAY=TU',
    start_time: '21:00',
    duration_min: 30,
  });
  const early = await createRoutine(db, DEVICE, {
    title: 'manhã',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    start_time: '06:00',
    duration_min: 30,
  });
  const gone = await createRoutine(db, DEVICE, {
    title: 'apagada',
    rrule: 'FREQ=WEEKLY;BYDAY=SU',
    start_time: '10:00',
    duration_min: 30,
  });
  const paused = await createRoutine(db, DEVICE, {
    title: 'pausada',
    rrule: 'FREQ=WEEKLY;BYDAY=SA',
    start_time: '11:00',
    duration_min: 30,
  });

  await deleteRoutine(db, DEVICE, gone.id);
  await updateRoutine(db, DEVICE, paused.id, { active: 0 });

  const visible = await listRoutines(db);
  expect(visible.map((r) => r.id)).toEqual([early.id, late.id]);
});

test('updateRoutine patches fields and bumps updated_at', async () => {
  const db = await freshDb();
  const routine = await createRoutine(db, DEVICE, {
    title: 'antes',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    start_time: '08:00',
    duration_min: 45,
  });

  const updated = await updateRoutine(db, DEVICE, routine.id, {
    title: 'depois',
    duration_min: 90,
  });
  expect(updated?.title).toBe('depois');
  expect(updated?.duration_min).toBe(90);
  expect(updated?.updated_at).toBeGreaterThan(routine.updated_at);
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(2);
});

test('updateRoutine returns null for missing or deleted routines', async () => {
  const db = await freshDb();
  expect(await updateRoutine(db, DEVICE, 'nope', { title: 'x' })).toBeNull();

  const routine = await createRoutine(db, DEVICE, {
    title: 'gone',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    start_time: '08:00',
    duration_min: 30,
  });
  await deleteRoutine(db, DEVICE, routine.id);
  expect(await updateRoutine(db, DEVICE, routine.id, { title: 'x' })).toBeNull();
});

test('deleteRoutine soft-deletes and appends an oplog row', async () => {
  const db = await freshDb();
  const routine = await createRoutine(db, DEVICE, {
    title: 'remover',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    start_time: '08:00',
    duration_min: 30,
  });

  await deleteRoutine(db, DEVICE, routine.id);

  const row = await db.exec('SELECT deleted_at FROM routines WHERE id = ?', [routine.id]);
  expect(row[0]?.['deleted_at']).not.toBeNull();
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(2);
});
