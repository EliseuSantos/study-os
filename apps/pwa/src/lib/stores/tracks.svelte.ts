import { createTrack, getOrCreateDeviceId, listTracks } from '@studyos/db';
import type { TrackRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';

export interface TracksStore {
  get tracks(): TrackRow[];
  add(title: string): Promise<void>;
  destroy(): void;
}

export function createTracksStore(): TracksStore {
  const live = liveQuery((db) => listTracks(db), ['tracks'], [] as TrackRow[]);

  return {
    get tracks() {
      return live.value;
    },
    async add(title: string) {
      const trimmed = title.trim();
      if (!trimmed) return;
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createTrack(db, deviceId, { title: trimmed });
      await live.refresh();
    },
    destroy() {
      live.destroy();
    },
  };
}
