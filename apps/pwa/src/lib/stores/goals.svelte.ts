import { getOrCreateDeviceId, createGoal, listGoals } from '@studyos/db';
import type { GoalRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';

export interface GoalsStore {
  get goals(): GoalRow[];
  add(title: string): Promise<void>;
  destroy(): void;
}

export function createGoalsStore(): GoalsStore {
  const live = liveQuery((db) => listGoals(db), ['goals'], [] as GoalRow[]);

  return {
    get goals() {
      return live.value;
    },
    async add(title: string) {
      const trimmed = title.trim();
      if (!trimmed) return;
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createGoal(db, deviceId, { title: trimmed });
      await live.refresh();
    },
    destroy() {
      live.destroy();
    },
  };
}
