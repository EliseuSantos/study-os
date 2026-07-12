import { getSetting, listDueReviews, setSetting } from '@studyos/db';
import { getDb } from '$lib/db/client';
import { liveQuery, type LiveQuery } from '$lib/db/live.svelte';

const PROFILE_NAME_KEY = 'profile_name';

export interface ProfileStore {
  get name(): string;
  get initial(): string;
  get dueCount(): number;
  rename(next: string): Promise<void>;
  destroy(): void;
}

export function createProfileStore(): ProfileStore {
  const nameLive: LiveQuery<string> = liveQuery(
    async (db) => (await getSetting(db, PROFILE_NAME_KEY)) ?? 'estudante',
    ['settings'],
    'estudante',
  );
  const dueLive = liveQuery(
    async (db) => (await listDueReviews(db, Date.now())).length,
    ['fsrs_state', 'cards', 'topics'],
    0,
  );

  return {
    get name() {
      return nameLive.value;
    },
    get initial() {
      return (nameLive.value.trim()[0] ?? 'e').toUpperCase();
    },
    get dueCount() {
      return dueLive.value;
    },
    async rename(next: string) {
      const trimmed = next.trim();
      if (trimmed === '') return;
      const db = await getDb();
      await setSetting(db, PROFILE_NAME_KEY, trimmed);
      await nameLive.refresh();
    },
    destroy() {
      nameLive.destroy();
      dueLive.destroy();
    },
  };
}
