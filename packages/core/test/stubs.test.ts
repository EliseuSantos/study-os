import { expect, test } from 'bun:test';
import { planDay } from '../src/planner';
import { dailyTotals } from '../src/stats';

test('planDay is an M2 stub', () => {
  expect(() => planDay([], [], 0)).toThrow('not implemented (M2)');
});

test('stats is an M2 stub', () => {
  expect(() => dailyTotals([])).toThrow('not implemented (M2)');
});
