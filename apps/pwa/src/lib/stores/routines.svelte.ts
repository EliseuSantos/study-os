import {
  createRoutine,
  deleteRoutine,
  getOrCreateDeviceId,
  listRoutines,
  listTracks,
} from '@studyos/db';
import type { RoutineRow, TrackRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';

// Day number (0=Sun..6=Sat) -> RRULE BYDAY token, per the app-wide subset.
const BYDAY_BY_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export function rruleFromDays(days: number[]): string {
  const tokens = [...new Set(days)]
    .toSorted((a, b) => a - b)
    .flatMap((day) => {
      const token = BYDAY_BY_DAY[day];
      return token === undefined ? [] : [token];
    });
  return `FREQ=WEEKLY;BYDAY=${tokens.join(',')}`;
}

export interface RoutineDraft {
  title: string;
  track_id: string | null;
  days: number[];
  start_time: string;
  duration_min: number;
}

export interface RoutinesStore {
  get routines(): RoutineRow[];
  get tracks(): TrackRow[];
  add(draft: RoutineDraft): Promise<void>;
  remove(id: string): Promise<void>;
  destroy(): void;
}

export function createRoutinesStore(): RoutinesStore {
  const routinesLive = liveQuery((db) => listRoutines(db), ['routines'], [] as RoutineRow[]);
  const tracksLive = liveQuery((db) => listTracks(db), ['tracks'], [] as TrackRow[]);

  return {
    get routines() {
      return routinesLive.value;
    },
    get tracks() {
      return tracksLive.value;
    },
    async add(draft: RoutineDraft) {
      const title = draft.title.trim();
      const duration = Math.floor(draft.duration_min);
      if (!title || draft.days.length === 0 || !draft.start_time || duration < 1) return;
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createRoutine(db, deviceId, {
        title,
        track_id: draft.track_id,
        rrule: rruleFromDays(draft.days),
        start_time: draft.start_time,
        duration_min: duration,
      });
      await routinesLive.refresh();
    },
    async remove(id: string) {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await deleteRoutine(db, deviceId, id);
      await routinesLive.refresh();
    },
    destroy() {
      routinesLive.destroy();
      tracksLive.destroy();
    },
  };
}
