import { expect, test } from 'bun:test';
import { buildClassProgressSummary } from '../src/repo/stats-queries';
import { importSnapshot, type TrackSnapshotShape } from '../src/repo/snapshot';
import { listTopics, setTopicStatus } from '../src/repo/topics';
import { freshDb } from './load-migrations';

const DEVICE = 'device-test';

test('summary reflects done topics by origin_key for the joined share', async () => {
  const db = await freshDb();
  const snap: TrackSnapshotShape = {
    format: 'studyos-track',
    version: 1,
    exported_at: 1000,
    track: { title: 'T', description: null, mode: 'schedule' },
    topics: [
      { key: 0, parent_key: null, sid: 'sid-a', title: 'A', notes_md: null, position: 0 },
      { key: 1, parent_key: null, sid: 'sid-b', title: 'B', notes_md: null, position: 1 },
    ],
    cards: [],
    lessons: [],
    lesson_items: [],
    content: [],
  };
  await importSnapshot(db, DEVICE, snap, { origin: 'share:abc123', origin_version: 'h' });
  const trackId = (await db.exec('SELECT id FROM tracks'))[0]?.['id'] as string;
  const topics = await listTopics(db, trackId);
  await setTopicStatus(db, DEVICE, topics.find((t) => t.title === 'A')!.id, 'done');

  const summary = await buildClassProgressSummary(db, 'abc123');
  expect(summary).toEqual({
    topics_done: 1,
    topics_total: 2,
    week_minutes: 0,
    topics: { 'sid-a': 1, 'sid-b': 0 },
  });

  expect(await buildClassProgressSummary(db, 'outra')).toBeNull();
});
