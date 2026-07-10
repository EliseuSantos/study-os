import { newId, now } from '@studyos/shared';

export interface GoalItem {
  id: string;
  title: string;
  createdAt: number;
}

export interface GoalsStore {
  get goals(): GoalItem[];
  add(title: string): void;
}

export function createGoalsStore(): GoalsStore {
  let goals = $state<GoalItem[]>([]);

  return {
    get goals() {
      return goals;
    },
    add(title: string) {
      const trimmed = title.trim();
      if (!trimmed) return;
      // integration: wire to @studyos/db repo (createGoal/listGoals) — local-only for M1-C visual QA
      goals = [{ id: newId(), title: trimmed, createdAt: now() }, ...goals];
    },
  };
}
