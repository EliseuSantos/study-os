import {
  addLessonItem,
  deleteLessonItem,
  getLesson,
  getOrCreateDeviceId,
  listLessonItems,
  listTopics,
  updateLesson,
  updateLessonItem,
  type DbDriver,
  type LessonPatch,
} from '@studyos/db';
import type { LessonItemRow, LessonRow, TopicRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';

async function withDb<T>(fn: (db: DbDriver, deviceId: string) => Promise<T>): Promise<T> {
  const db = await getDb();
  const deviceId = await getOrCreateDeviceId(db);
  return fn(db, deviceId);
}

export interface AddLessonEditorItemInput {
  kind: string;
  topic_id?: string | null;
  content_item_id?: string | null;
  body_md?: string | null;
}

export interface LessonEditorStore {
  get lesson(): LessonRow | null;
  get lessonLoaded(): boolean;
  get items(): LessonItemRow[];
  get topics(): TopicRow[];
  addItem(input: AddLessonEditorItemInput): Promise<void>;
  removeItem(id: string): Promise<void>;
  move(item: LessonItemRow, dir: -1 | 1): Promise<void>;
  updateNotes(notes: string): void;
  updateDuration(min: number | null): void;
  refreshItems(): Promise<void>;
  flush(): void;
  destroy(): void;
}

export function createLessonEditorStore(trackId: string, lessonId: string): LessonEditorStore {
  let lessonLoaded = $state(false);

  const lessonLive = liveQuery(
    async (db) => {
      const lesson = await getLesson(db, lessonId);
      lessonLoaded = true;
      return lesson !== null && lesson.deleted_at === null ? lesson : null;
    },
    ['lessons'],
    null as LessonRow | null,
  );
  const itemsLive = liveQuery(
    (db) => listLessonItems(db, lessonId),
    ['lesson_items'],
    [] as LessonItemRow[],
  );
  const topicsLive = liveQuery((db) => listTopics(db, trackId), ['topics'], [] as TopicRow[]);

  // updateLesson writes are debounced so typing presenter notes does not persist on
  // every keystroke; flush() runs on blur and on store destroy.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingPatch: LessonPatch | null = null;

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const patch = pendingPatch;
    pendingPatch = null;
    if (patch === null) return;
    void withDb((db, deviceId) => updateLesson(db, deviceId, lessonId, patch));
  }

  function schedule(patch: LessonPatch): void {
    pendingPatch = { ...pendingPatch, ...patch };
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, 600);
  }

  return {
    get lesson() {
      return lessonLive.value;
    },
    get lessonLoaded() {
      return lessonLoaded;
    },
    get items() {
      return itemsLive.value;
    },
    get topics() {
      return topicsLive.value;
    },
    async addItem(input: AddLessonEditorItemInput) {
      await withDb((db, deviceId) =>
        addLessonItem(db, deviceId, { lesson_id: lessonId, ...input }),
      );
      await itemsLive.refresh();
    },
    async removeItem(id: string) {
      await withDb((db, deviceId) => deleteLessonItem(db, deviceId, id));
      await itemsLive.refresh();
    },
    async move(item: LessonItemRow, dir: -1 | 1) {
      const items = itemsLive.value;
      const index = items.findIndex((i) => i.id === item.id);
      if (index === -1) return;
      const neighbor = items[index + dir];
      if (neighbor === undefined) return;
      await withDb(async (db, deviceId) => {
        await updateLessonItem(db, deviceId, item.id, { position: neighbor.position });
        await updateLessonItem(db, deviceId, neighbor.id, { position: item.position });
      });
      await itemsLive.refresh();
    },
    async refreshItems() {
      await itemsLive.refresh();
    },
    updateNotes(notes: string) {
      schedule({ presenter_notes_md: notes.trim() === '' ? null : notes });
    },
    updateDuration(min: number | null) {
      schedule({ estimated_duration_min: min });
    },
    flush,
    destroy() {
      flush();
      lessonLive.destroy();
      itemsLive.destroy();
      topicsLive.destroy();
    },
  };
}
