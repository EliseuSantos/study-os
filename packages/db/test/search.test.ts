import { expect, test } from 'bun:test';
import type { DbDriver } from '../src/driver';
import { attachContent } from '../src/repo/content';
import { createCard, deleteCard } from '../src/repo/cards';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { ensureSearchIndex, reindexAll, searchLocal } from '../src/search';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

async function seededDb(): Promise<{
  db: DbDriver;
  topicId: string;
  cardId: string;
  contentId: string;
}> {
  const db = await freshDb();
  await ensureSearchIndex(db);
  const track = await createTrack(db, DEVICE, { title: 'concurso' });
  const topic = await createTopic(db, DEVICE, {
    track_id: track.id,
    title: 'direito constitucional',
    notes_md: 'controle de constitucionalidade',
  });
  const card = await createCard(db, DEVICE, {
    topic_id: topic.id,
    front_md: 'o que é habeas corpus?',
    back_md: 'remédio constitucional contra prisão ilegal',
  });
  const content = await attachContent(db, DEVICE, {
    topic_id: topic.id,
    source: 'youtube',
    title: 'aula de estatística descritiva',
    kind: 'video',
  });
  await reindexAll(db);
  return { db, topicId: topic.id, cardId: card.id, contentId: content.id };
}

test('ensureSearchIndex is idempotent', async () => {
  const db = await freshDb();
  await ensureSearchIndex(db);
  await ensureSearchIndex(db);
  expect(await searchLocal(db, 'anything')).toEqual([]);
});

test('reindexAll indexes topics, cards and content_items', async () => {
  const { db, topicId, cardId, contentId } = await seededDb();

  const topics = await searchLocal(db, 'constitucional');
  expect(topics.some((h) => h.kind === 'topic' && h.ref_id === topicId)).toBe(true);

  const cards = await searchLocal(db, 'habeas');
  expect(cards.map((h) => ({ kind: h.kind, ref_id: h.ref_id }))).toEqual([
    { kind: 'card', ref_id: cardId },
  ]);

  const content = await searchLocal(db, 'estatística');
  expect(content.map((h) => ({ kind: h.kind, ref_id: h.ref_id }))).toEqual([
    { kind: 'content', ref_id: contentId },
  ]);
});

test('matches by prefix: constitu finds constitucional', async () => {
  const { db, topicId } = await seededDb();
  const hits = await searchLocal(db, 'constitu');
  expect(hits.some((h) => h.ref_id === topicId)).toBe(true);
});

test('snippet marks the match in the body column', async () => {
  const { db, cardId } = await seededDb();
  const hit = (await searchLocal(db, 'remédio')).find((h) => h.ref_id === cardId);
  expect(hit?.title).toBe('o que é habeas corpus?');
  expect(hit?.snippet).toContain('[remédio]');
});

test('hostile input is sanitized, never a syntax error', async () => {
  const { db } = await seededDb();
  expect(await searchLocal(db, 'a" OR 1=1 --')).toBeInstanceOf(Array);
  expect(await searchLocal(db, '(constitu* AND NOT) ^ "')).toBeInstanceOf(Array);
  expect(await searchLocal(db, '"" ** (((')).toEqual([]);
  expect(await searchLocal(db, '   ')).toEqual([]);
});

test('soft-deleted rows disappear after reindexAll', async () => {
  const { db, cardId } = await seededDb();
  expect((await searchLocal(db, 'habeas')).length).toBe(1);

  await deleteCard(db, DEVICE, cardId);
  await reindexAll(db);
  expect(await searchLocal(db, 'habeas')).toEqual([]);
});

test('bm25 order: title hit ranks above body hit for the same term', async () => {
  const db = await freshDb();
  await ensureSearchIndex(db);
  const track = await createTrack(db, DEVICE, { title: 't' });
  const inBody = await createTopic(db, DEVICE, {
    track_id: track.id,
    title: 'tema geral de estudos',
    notes_md: 'este resumo menciona hermenêutica entre vários outros assuntos',
  });
  const inTitle = await createTopic(db, DEVICE, {
    track_id: track.id,
    title: 'hermenêutica',
  });
  await reindexAll(db);

  const hits = await searchLocal(db, 'hermenêutica');
  expect(hits.map((h) => h.ref_id)).toEqual([inTitle.id, inBody.id]);
});

test('respects the limit parameter', async () => {
  const db = await freshDb();
  await ensureSearchIndex(db);
  const track = await createTrack(db, DEVICE, { title: 't' });
  for (let i = 0; i < 5; i++) {
    await createTopic(db, DEVICE, { track_id: track.id, title: `revisão ${i}` });
  }
  await reindexAll(db);
  expect((await searchLocal(db, 'revisão', 3)).length).toBe(3);
});
