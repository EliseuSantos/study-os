import { now } from '@studyos/shared';

// max(now, prev + 1) keeps updated_at strictly increasing so same-millisecond
// edits still pass the strict-> LWW guard.
export function bumpedTs(prev: number): number {
  return Math.max(now(), prev + 1);
}
