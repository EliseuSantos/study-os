import type { SessionRow } from '@studyos/shared';

export interface DailyTotals {
  date: string;
  net_seconds: number;
  session_count: number;
}

// TODO(M2): aggregate sessions into per-day totals and streaks.
export function dailyTotals(_sessions: readonly SessionRow[]): DailyTotals[] {
  throw new Error('not implemented (M2)');
}

export function streakDays(_totals: readonly DailyTotals[]): number {
  throw new Error('not implemented (M2)');
}
