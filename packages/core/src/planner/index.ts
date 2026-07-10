import type { CycleSlotRow, RoutineRow } from '@studyos/shared';

export interface PlannedBlock {
  routine_id: string;
  topic_id: string | null;
  starts_at: number;
  duration_min: number;
}

// TODO(M2): expand rrules and rotate cycle slots into concrete blocks.
export function planDay(
  _routines: readonly RoutineRow[],
  _slots: readonly CycleSlotRow[],
  _dayStart: number,
): PlannedBlock[] {
  throw new Error('not implemented (M2)');
}
