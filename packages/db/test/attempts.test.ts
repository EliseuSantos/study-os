import { expect, test } from 'bun:test';
import { attemptStatsByTopic, recordAttempt } from '../src/repo/attempts';
import { createCard, listQuizCardsByTrack } from '../src/repo/cards';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('attempts aggregate per card and never touch the oplog', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const topic = await createTopic(db, DEVICE, { track_id: track.id, title: 'x' });
  const card = await createCard(db, DEVICE, {
    topic_id: topic.id,
    kind: 'quiz',
    front_md: JSON.stringify({ q: 'Q?', options: ['a', 'b'], answer: 0 }),
  });

  await recordAttempt(db, card.id, true, 1000);
  await recordAttempt(db, card.id, false, 2000);
  await recordAttempt(db, card.id, false, 3000);

  const stats = await attemptStatsByTopic(db, topic.id);
  expect(stats.get(card.id)).toEqual({ card_id: card.id, attempts: 3, wrong: 2 });

  const ops = await db.exec("SELECT * FROM oplog WHERE tbl = 'question_attempts'");
  expect(ops.length).toBe(0);
});

test('listQuizCardsByTrack spans topics and filters by topic', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 't' });
  const t1 = await createTopic(db, DEVICE, { track_id: track.id, title: 'a' });
  const t2 = await createTopic(db, DEVICE, { track_id: track.id, title: 'b' });
  await createCard(db, DEVICE, { topic_id: t1.id, kind: 'quiz', front_md: '{}' });
  await createCard(db, DEVICE, { topic_id: t2.id, kind: 'quiz', front_md: '{}' });
  await createCard(db, DEVICE, { topic_id: t2.id, front_md: 'basic' });

  expect((await listQuizCardsByTrack(db, track.id)).length).toBe(2);
  expect((await listQuizCardsByTrack(db, track.id, t2.id)).length).toBe(1);
});
