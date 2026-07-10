import { expect, test } from 'bun:test';
import { createCard } from '../src/repo/cards';
import { attachContent } from '../src/repo/content';
import { addLessonItem, createLesson, listLessonItems, listLessons } from '../src/repo/lessons';
import { exportTrackData, importSnapshot, type TrackSnapshotShape } from '../src/repo/snapshot';
import { createTopic, listTopics } from '../src/repo/topics';
import { createTrack, getTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

function snapshotFixture(): TrackSnapshotShape {
  return {
    format: 'studyos-track',
    version: 1,
    exported_at: 1_700_000_000_000,
    track: { title: 'ENEM linguagens', description: 'trilha do professor', mode: 'schedule' },
    topics: [
      { key: 1, parent_key: null, title: 'Interpretação', notes_md: 'base', position: 0 },
      { key: 2, parent_key: 1, title: 'Gêneros textuais', notes_md: null, position: 0 },
      { key: 3, parent_key: 1, title: 'Figuras de linguagem', notes_md: null, position: 1 },
      { key: 4, parent_key: null, title: 'Gramática', notes_md: null, position: 1 },
    ],
    cards: [
      {
        topic_key: 2,
        kind: 'basic',
        front_md: 'O que é crônica?',
        back_md: 'Narrativa curta',
        options_json: null,
      },
      { topic_key: 4, kind: 'basic', front_md: 'Crase?', back_md: 'a + a', options_json: null },
    ],
    lessons: [
      {
        key: 1,
        title: 'Aula 1',
        presenter_notes_md: 'começar leve',
        estimated_duration_min: 50,
        position: 0,
      },
    ],
    lesson_items: [
      { lesson_key: 1, topic_key: 1, kind: 'topic', body_md: null, position: 0 },
      { lesson_key: 1, topic_key: null, kind: 'note', body_md: 'intervalo', position: 1 },
    ],
    content: [
      {
        topic_key: 2,
        source: 'youtube',
        external_id: 'vid-1',
        url: 'https://youtu.be/vid-1',
        title: 'Aula de crônica',
        kind: 'video',
      },
    ],
  };
}

test('exportTrackData gathers the not-deleted rows of one track', async () => {
  const db = await freshDb();
  const track = await createTrack(db, DEVICE, { title: 'minha trilha' });
  const other = await createTrack(db, DEVICE, { title: 'outra' });
  const root = await createTopic(db, DEVICE, { track_id: track.id, title: 'raiz' });
  const child = await createTopic(db, DEVICE, {
    track_id: track.id,
    parent_id: root.id,
    title: 'filho',
  });
  await createTopic(db, DEVICE, { track_id: other.id, title: 'alheio' });
  const card = await createCard(db, DEVICE, { topic_id: child.id, front_md: 'f', back_md: 'b' });
  const lesson = await createLesson(db, DEVICE, { track_id: track.id, title: 'aula' });
  const item = await addLessonItem(db, DEVICE, {
    lesson_id: lesson.id,
    kind: 'topic',
    topic_id: root.id,
  });
  const content = await attachContent(db, DEVICE, {
    topic_id: root.id,
    source: 'rss',
    title: 'artigo',
    kind: 'article',
  });

  const data = await exportTrackData(db, track.id);

  expect(data.track).toEqual(track);
  expect(data.topics.map((t) => t.id).toSorted()).toEqual([root.id, child.id].toSorted());
  expect(data.cards).toEqual([card]);
  expect(data.lessons).toEqual([lesson]);
  expect(data.lessonItems).toEqual([item]);
  expect(data.content).toEqual([content]);
});

test('exportTrackData throws for an unknown track', async () => {
  const db = await freshDb();
  await expect(exportTrackData(db, 'nope')).rejects.toThrow('track not found');
});

test('importSnapshot creates everything with correct parent chains and origin fields', async () => {
  const db = await freshDb();
  const s = snapshotFixture();

  const trackId = await importSnapshot(db, DEVICE, s, {
    origin: 'share:abc123',
    origin_version: 'deadbeef',
  });

  const track = await getTrack(db, trackId);
  expect(track?.title).toBe('ENEM linguagens');
  expect(track?.mode).toBe('schedule');
  expect(track?.origin).toBe('share:abc123');
  expect(track?.origin_version).toBe('deadbeef');

  const topics = await listTopics(db, trackId);
  expect(topics.length).toBe(4);
  const byTitle = new Map(topics.map((t) => [t.title, t]));
  const interp = byTitle.get('Interpretação');
  const generos = byTitle.get('Gêneros textuais');
  const figuras = byTitle.get('Figuras de linguagem');
  const gramatica = byTitle.get('Gramática');
  expect(interp?.parent_id).toBeNull();
  expect(gramatica?.parent_id).toBeNull();
  expect(generos?.parent_id).toBe(interp?.id ?? '');
  expect(figuras?.parent_id).toBe(interp?.id ?? '');
  expect([generos?.position, figuras?.position]).toEqual([0, 1]);
  expect(topics.every((t) => t.status === 'pending')).toBe(true);

  const cards = await db.exec(
    'SELECT c.front_md, c.topic_id FROM cards c JOIN topics t ON t.id = c.topic_id ' +
      'WHERE t.track_id = ? ORDER BY c.front_md',
    [trackId],
  );
  expect(cards.length).toBe(2);
  expect(cards[1]?.['topic_id']).toBe(generos?.id ?? '');

  const lessons = await listLessons(db, trackId);
  expect(lessons.length).toBe(1);
  expect(lessons[0]?.presenter_notes_md).toBe('começar leve');

  const items = await listLessonItems(db, lessons[0]?.id ?? '');
  expect(items.length).toBe(2);
  expect(items[0]?.topic_id).toBe(interp?.id ?? '');
  expect(items[0]?.content_item_id).toBeNull();
  expect(items[1]?.topic_id).toBeNull();
  expect(items[1]?.body_md).toBe('intervalo');

  const content = await db.exec('SELECT * FROM content_items WHERE topic_id = ?', [
    generos?.id ?? '',
  ]);
  expect(content.length).toBe(1);
  expect(content[0]?.['external_id']).toBe('vid-1');

  // imported cards start fresh — no fsrs rows
  expect((await db.exec('SELECT * FROM fsrs_state')).length).toBe(0);
});

test('importSnapshot appends one oplog row per imported row, all from one batch', async () => {
  const db = await freshDb();
  const s = snapshotFixture();

  await importSnapshot(db, DEVICE, s, { origin: 'file', origin_version: 'cafe' });

  const counts = new Map<string, number>();
  for (const op of await db.exec('SELECT tbl FROM oplog')) {
    const tbl = op['tbl'] as string;
    counts.set(tbl, (counts.get(tbl) ?? 0) + 1);
  }
  expect(counts.get('tracks')).toBe(1);
  expect(counts.get('topics')).toBe(4);
  expect(counts.get('cards')).toBe(2);
  expect(counts.get('lessons')).toBe(1);
  expect(counts.get('lesson_items')).toBe(2);
  expect(counts.get('content_items')).toBe(1);
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(11);
});

test('importSnapshot rejects a parent_key pointing to an unknown key', async () => {
  const db = await freshDb();
  const s = snapshotFixture();
  s.topics[1] = { ...(s.topics[1] as TrackSnapshotShape['topics'][number]), parent_key: 99 };

  await expect(
    importSnapshot(db, DEVICE, s, { origin: 'file', origin_version: 'x' }),
  ).rejects.toThrow('unknown parent key 99');
});

test('importSnapshot is atomic: a bad snapshot creates zero rows', async () => {
  const db = await freshDb();
  const s = snapshotFixture();
  // crafted bad row: duplicate topic keys make the ordinal map ambiguous
  s.topics.push({ key: 1, parent_key: null, title: 'dup', notes_md: null, position: 2 });

  await expect(
    importSnapshot(db, DEVICE, s, { origin: 'file', origin_version: 'x' }),
  ).rejects.toThrow('duplicate topic key 1');

  expect((await db.exec('SELECT * FROM tracks')).length).toBe(0);
  expect((await db.exec('SELECT * FROM topics')).length).toBe(0);
  expect((await db.exec('SELECT * FROM cards')).length).toBe(0);
  expect((await db.exec('SELECT * FROM lessons')).length).toBe(0);
  expect((await db.exec('SELECT * FROM lesson_items')).length).toBe(0);
  expect((await db.exec('SELECT * FROM content_items')).length).toBe(0);
  expect((await db.exec('SELECT * FROM oplog')).length).toBe(0);
});
