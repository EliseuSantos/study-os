import { createGoal, deleteGoal, getOrCreateDeviceId, listGoals, updateGoal } from '@studyos/db';
import type { GoalRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';

export interface GoalsStore {
  get goals(): GoalRow[];
  add(title: string, targetDate?: number | null, trackId?: string | null): Promise<void>;
  toggleDone(goal: GoalRow): Promise<void>;
  remove(id: string): Promise<void>;
  destroy(): void;
}

export function createGoalsStore(): GoalsStore {
  const live = liveQuery((db) => listGoals(db), ['goals'], [] as GoalRow[]);

  return {
    get goals() {
      return live.value;
    },
    async add(title: string, targetDate: number | null = null, trackId: string | null = null) {
      const trimmed = title.trim();
      if (!trimmed) return;
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createGoal(db, deviceId, { title: trimmed, target_date: targetDate, track_id: trackId });
      await live.refresh();
    },
    async toggleDone(goal: GoalRow) {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await updateGoal(db, deviceId, goal.id, {
        status: goal.status === 'done' ? 'active' : 'done',
      });
      await live.refresh();
    },
    async remove(id: string) {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await deleteGoal(db, deviceId, id);
      await live.refresh();
    },
    destroy() {
      live.destroy();
    },
  };
}
