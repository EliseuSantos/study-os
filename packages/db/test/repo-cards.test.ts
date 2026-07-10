import { expect, test } from 'bun:test';
import { createCard, deleteCard, listCardsByTopic, listCardsByTrack } from '../src/repo/cards';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('createCard writes the card and exactly one oplog row', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });

  const card = await createCard(db, DEVICE, { topic_id: topic.id, front_md: 'Q?' });
  expect(card.kind).toBe('basic');
  expect(card.back_md).toBeNull();

  const cards = await db.exec('SELECT * FROM cards');
  expect(cards.length).toBe(1);
  expect(cards[0]?.['front_md']).toBe('Q?');

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'cards'");
  expect(ops.length).toBe(1);
  expect(ops[0]?.['row_id']).toBe(card.id);
});

test('listCardsByTopic and listCardsByTrack join and hide soft-deleted cards', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const other = await createTrack(db, DEVICE, { title: 'other' });
  const t1 = await createTopic(db, DEVICE, { track_id: track.id, title: 't1' });
  const t2 = await createTopic(db, DEVICE, { track_id: track.id, title: 't2' });
  const t3 = await createTopic(db, DEVICE, { track_id: other.id, title: 't3' });

  const c1 = await createCard(db, DEVICE, { topic_id: t1.id, front_md: 'c1', back_md: 'a1' });
  const c2 = await createCard(db, DEVICE, { topic_id: t2.id, front_md: 'c2' });
  const c3 = await createCard(db, DEVICE, { topic_id: t1.id, front_md: 'c3' });
  await createCard(db, DEVICE, { topic_id: t3.id, front_md: 'elsewhere' });

  expect((await listCardsByTopic(db, t1.id)).map((c) => c.id)).toEqual([c1.id, c3.id]);
  expect((await listCardsByTrack(db, track.id)).map((c) => c.id)).toEqual([c1.id, c2.id, c3.id]);

  await deleteCard(db, DEVICE, c3.id);
  expect((await listCardsByTopic(db, t1.id)).map((c) => c.id)).toEqual([c1.id]);
  expect((await listCardsByTrack(db, track.id)).map((c) => c.id)).toEqual([c1.id, c2.id]);

  const row = await db.exec('SELECT deleted_at FROM cards WHERE id = ?', [c3.id]);
  expect(row[0]?.['deleted_at']).not.toBeNull();
});
