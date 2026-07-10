import type { CycleSlotRow, RoutineRow } from '@studyos/shared';

export interface PlannedBlock {
  routine_id: string;
  topic_id: string | null;
  starts_at: number;
  duration_min: number;
}

export interface QueueItem {
  kind: 'review';
  ref_kind: 'card' | 'topic';
  ref_id: string;
  due_at: number;
  title: string;
}

const byDueAt = (a: QueueItem, b: QueueItem): number => a.due_at - b.due_at;

export function dailyQueue(items: QueueItem[], now: number): QueueItem[] {
  const due = items.filter((i) => i.due_at <= now);
  const future = items.filter((i) => i.due_at > now);
  return [...due.toSorted(byDueAt), ...future.toSorted(byDueAt)];
}

// TODO(M2): expand rrules and rotate cycle slots into concrete blocks.
export function planDay(
  _routines: readonly RoutineRow[],
  _slots: readonly CycleSlotRow[],
  _dayStart: number,
): PlannedBlock[] {
  throw new Error('not implemented (M2)');
}
