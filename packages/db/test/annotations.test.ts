import { describe, expect, test } from 'bun:test';
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  setAnnotationNote,
} from '../src/repo/annotations';
import { attachContent } from '../src/repo/content';
import { createTopic } from '../src/repo/topics';
import { createTrack } from '../src/repo/tracks';
import { freshDb } from './load-migrations';

async function setup() {
  const db = await freshDb();
  const track = await createTrack(db, 'dev1', { title: 't' });
  const topic = await createTopic(db, 'dev1', { track_id: track.id, title: 'top' });
  const content = await attachContent(db, 'dev1', {
    topic_id: topic.id,
    source: 'web',
    url: 'https://x.test/a',
    title: 'artigo',
    kind: 'article',
  });
  return { db, content };
}

describe('annotations repo', () => {
  test('create + list ordered, oplog row written', async () => {
    const { db, content } = await setup();
    const a = await createAnnotation(db, 'dev1', {
      content_item_id: content.id,
      anchor_json: JSON.stringify({ start: 0, end: 5, quote: 'abcde' }),
    });
    const list = await listAnnotations(db, content.id);
    expect(list.map((x) => x.id)).toEqual([a.id]);
    const oplog = await db.exec("SELECT tbl FROM oplog WHERE tbl = 'annotations'");
    expect(oplog.length).toBeGreaterThan(0);
  });

  test('note set/clear bumps updated_at', async () => {
    const { db, content } = await setup();
    const a = await createAnnotation(db, 'dev1', {
      content_item_id: content.id,
      anchor_json: '{}',
    });
    const noted = await setAnnotationNote(db, 'dev1', a.id, 'minha nota');
    expect(noted?.note_md).toBe('minha nota');
    expect(noted!.updated_at).toBeGreaterThan(a.updated_at);
  });

  test('soft delete hides from list', async () => {
    const { db, content } = await setup();
    const a = await createAnnotation(db, 'dev1', {
      content_item_id: content.id,
      anchor_json: '{}',
    });
    await deleteAnnotation(db, 'dev1', a.id);
    expect(await listAnnotations(db, content.id)).toEqual([]);
  });
});
