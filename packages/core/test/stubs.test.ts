import { expect, test } from 'bun:test';
import { schedule } from '../src/fsrs';
import { planDay } from '../src/planner';
import { parseOutline } from '../src/outline-parser';
import { dailyTotals } from '../src/stats';

test('fsrs schedule placeholder bumps reps', () => {
  const input = {
    state: 'new' as const,
    stability: 0,
    difficulty: 0,
    due_at: null,
    reps: 0,
    lapses: 0,
  };
  const next = schedule(input, 3, Date.now());
  expect(next.reps).toBe(1);
  expect(input.reps).toBe(0);
});

test('planner is an M2 stub', () => {
  expect(() => planDay([], [], 0)).toThrow('not implemented (M2)');
});

test('outline parser is an M2 stub', () => {
  expect(() => parseOutline('# Topic')).toThrow('not implemented (M2)');
});

test('stats is an M2 stub', () => {
  expect(() => dailyTotals([])).toThrow('not implemented (M2)');
});
