import {
  createCard,
  createTopic,
  createTopicTree,
  getOrCreateDeviceId,
  getTrack,
  listCardsByTopic,
  listTopics,
  setTopicStatus,
  type DbDriver,
  type OutlineNodeInput,
  type TopicStatus,
} from '@studyos/db';
import type { CardRow, TopicRow, TrackRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';

function nextStatus(status: string): TopicStatus {
  if (status === 'pending') return 'studying';
  if (status === 'studying') return 'done';
  return 'pending';
}

async function withDb<T>(fn: (db: DbDriver, deviceId: string) => Promise<T>): Promise<T> {
  const db = await getDb();
  const deviceId = await getOrCreateDeviceId(db);
  return fn(db, deviceId);
}

export interface TrackDetailStore {
  get track(): TrackRow | null;
  get trackLoaded(): boolean;
  get topics(): TopicRow[];
  get cards(): CardRow[];
  get selectedTopicId(): string | null;
  selectTopic(id: string | null): void;
  addTopic(parentId: string | null, title: string): Promise<void>;
  importOutline(nodes: OutlineNodeInput[]): Promise<number>;
  cycleStatus(topic: TopicRow): Promise<void>;
  addCard(front: string, back: string): Promise<void>;
  destroy(): void;
}

export function createTrackDetailStore(trackId: string): TrackDetailStore {
  let trackLoaded = $state(false);
  let selectedTopicId = $state<string | null>(null);

  const trackLive = liveQuery(
    async (db) => {
      const track = await getTrack(db, trackId);
      trackLoaded = true;
      return track;
    },
    ['tracks'],
    null as TrackRow | null,
  );
  const topicsLive = liveQuery((db) => listTopics(db, trackId), ['topics'], [] as TopicRow[]);
  const cardsLive = liveQuery(
    async (db) => (selectedTopicId === null ? [] : listCardsByTopic(db, selectedTopicId)),
    ['cards'],
    [] as CardRow[],
  );

  return {
    get track() {
      return trackLive.value;
    },
    get trackLoaded() {
      return trackLoaded;
    },
    get topics() {
      return topicsLive.value;
    },
    get cards() {
      return cardsLive.value;
    },
    get selectedTopicId() {
      return selectedTopicId;
    },
    selectTopic(id: string | null) {
      selectedTopicId = id;
      void cardsLive.refresh();
    },
    async addTopic(parentId: string | null, title: string) {
      const trimmed = title.trim();
      if (!trimmed) return;
      await withDb((db, deviceId) =>
        createTopic(db, deviceId, { track_id: trackId, parent_id: parentId, title: trimmed }),
      );
      await topicsLive.refresh();
    },
    async importOutline(nodes: OutlineNodeInput[]) {
      if (nodes.length === 0) return 0;
      const count = await withDb((db, deviceId) => createTopicTree(db, deviceId, trackId, nodes));
      await topicsLive.refresh();
      return count;
    },
    async cycleStatus(topic: TopicRow) {
      await withDb((db, deviceId) =>
        setTopicStatus(db, deviceId, topic.id, nextStatus(topic.status)),
      );
      await topicsLive.refresh();
    },
    async addCard(front: string, back: string) {
      const topicId = selectedTopicId;
      const frontTrimmed = front.trim();
      if (topicId === null || !frontTrimmed) return;
      const backTrimmed = back.trim();
      await withDb((db, deviceId) =>
        createCard(db, deviceId, {
          topic_id: topicId,
          front_md: frontTrimmed,
          back_md: backTrimmed === '' ? null : backTrimmed,
        }),
      );
      await cardsLive.refresh();
    },
    destroy() {
      trackLive.destroy();
      topicsLive.destroy();
      cardsLive.destroy();
    },
  };
}
