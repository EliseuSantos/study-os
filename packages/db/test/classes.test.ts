import { expect, test } from 'bun:test';
import { createClass, deleteClass, listClasses } from '../src/repo/classes';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('classes: create, list ordered, soft delete; oplog rows written', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });

  const a = await createClass(db, DEVICE, { track_id: track.id, name: 'Turma A', share_id: 's1' });
  await createClass(db, DEVICE, { track_id: track.id, name: 'Turma B', share_id: 's2' });

  expect((await listClasses(db, track.id)).map((c) => c.name)).toEqual(['Turma A', 'Turma B']);

  await deleteClass(db, DEVICE, a.id);
  expect((await listClasses(db, track.id)).map((c) => c.name)).toEqual(['Turma B']);

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'classes'");
  expect(ops.length).toBe(3);
});
