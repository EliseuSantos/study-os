import { expect, test } from 'bun:test';
import { applySnapshotMerge, importSnapshot, type TrackSnapshotShape } from '../src/repo/snapshot';
import { listTopics, setTopicStatus } from '../src/repo/topics';
import { createCard, listCardsByTopic } from '../src/repo/cards';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

function snap(topics: TrackSnapshotShape['topics'], cards: TrackSnapshotShape['cards'] = []): TrackSnapshotShape {
  return {
    format: 'studyos-track',
    version: 1,
    content_version: 2,
    exported_at: 1000,
    track: { title: 'Edital', description: null, mode: 'schedule' },
    topics,
    cards,
    lessons: [],
    lesson_items: [],
    content: [],
  };
}

test('merge keeps progress on matched topics, adds new, soft-deletes removed', async () => {
  const db = await freshDb();
  const v1 = snap([
    { key: 0, parent_key: null, sid: 'sid-a', title: 'A', notes_md: null, position: 0 },
    { key: 1, parent_key: null, sid: 'sid-b', title: 'B', notes_md: null, position: 1 },
  ]);
  const trackId = await importSnapshot(db, DEVICE, v1, { origin: 'share:x', origin_version: 'h1' });
  const topics = await listTopics(db, trackId);
  const topicA = topics.find((t) => t.title === 'A');
  const topicB = topics.find((t) => t.title === 'B');
  expect(topicA?.origin_key).toBe('sid-a');

  // student progress: A done, a local card on A
  await setTopicStatus(db, DEVICE, topicA!.id, 'done');
  await createCard(db, DEVICE, { topic_id: topicA!.id, front_md: 'meu card' });

  // v2: A renamed, B removed, C added (with one incoming card)
  const v2 = snap(
    [
      { key: 0, parent_key: null, sid: 'sid-a', title: 'A renovado', notes_md: null, position: 0 },
      { key: 1, parent_key: null, sid: 'sid-c', title: 'C', notes_md: null, position: 1 },
    ],
    [{ topic_key: 1, kind: 'basic', front_md: 'card novo do professor', back_md: null, options_json: null }],
  );
  const plan = {
    matched: [{ localId: topicA!.id, topic: v2.topics[0]! }],
    added: [v2.topics[1]!],
    removed: [topicB!.id],
  };
  const result = await applySnapshotMerge(db, DEVICE, trackId, plan, v2);
  expect(result).toEqual({ updated: 1, added: 1, removed: 1 });

  const after = await listTopics(db, trackId);
  const names = after.map((t) => t.title).toSorted();
  expect(names).toEqual(['A renovado', 'C']);
  const renamed = after.find((t) => t.title === 'A renovado');
  expect(renamed?.id).toBe(topicA!.id);
  expect(renamed?.status).toBe('done'); // progress preserved
  expect((await listCardsByTopic(db, renamed!.id)).map((c) => c.front_md)).toEqual(['meu card']);

  const added = after.find((t) => t.title === 'C');
  expect(added?.origin_key).toBe('sid-c');
  expect((await listCardsByTopic(db, added!.id)).map((c) => c.front_md)).toEqual([
    'card novo do professor',
  ]);
});
