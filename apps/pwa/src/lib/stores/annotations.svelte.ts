import {
  createAnnotation,
  deleteAnnotation,
  getOrCreateDeviceId,
  listAnnotations,
  setAnnotationNote,
} from '@studyos/db';
import type { AnnotationRow } from '@studyos/shared';
import type { TextAnchor } from '@studyos/core';
import { getDb } from '$lib/db/client';
import { liveQuery, type LiveQuery } from '$lib/db/live.svelte';

export interface ParsedAnnotation extends AnnotationRow {
  anchor: TextAnchor;
}

export interface AnnotationsStore {
  get items(): ParsedAnnotation[];
  add(anchor: TextAnchor, noteMd?: string | null): Promise<void>;
  setNote(id: string, noteMd: string | null): Promise<void>;
  remove(id: string): Promise<void>;
  destroy(): void;
}

export function createAnnotationsStore(contentItemId: string): AnnotationsStore {
  const live: LiveQuery<AnnotationRow[]> = liveQuery(
    (db) => listAnnotations(db, contentItemId),
    ['annotations'],
    [] as AnnotationRow[],
  );

  return {
    get items() {
      return live.value.flatMap((row): ParsedAnnotation[] => {
        try {
          return [{ ...row, anchor: JSON.parse(row.anchor_json) as TextAnchor }];
        } catch {
          return []; // unparseable anchor: hide rather than crash the reader
        }
      });
    },
    async add(anchor, noteMd = null) {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createAnnotation(db, deviceId, {
        content_item_id: contentItemId,
        anchor_json: JSON.stringify(anchor),
        note_md: noteMd,
      });
      await live.refresh();
    },
    async setNote(id, noteMd) {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await setAnnotationNote(db, deviceId, id, noteMd);
      await live.refresh();
    },
    async remove(id) {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await deleteAnnotation(db, deviceId, id);
      await live.refresh();
    },
    destroy() {
      live.destroy();
    },
  };
}

/** "trilha · tópico" options for pickers that need any topic in the library. */
export async function flatTopicOptions(): Promise<{ value: string; label: string }[]> {
  const { listTracks, listTopics } = await import('@studyos/db');
  const db = await getDb();
  const tracks = await listTracks(db);
  const topicsPerTrack = await Promise.all(tracks.map((t) => listTopics(db, t.id)));
  return tracks.flatMap((track, i) =>
    (topicsPerTrack[i] ?? []).map((topic) => ({
      value: topic.id,
      label: `${track.title} · ${topic.title}`,
    })),
  );
}
