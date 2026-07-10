import { expect, test } from 'bun:test';
import { dailyQueue, type QueueItem } from '../src/planner';

const item = (ref_id: string, due_at: number): QueueItem => ({
  kind: 'review',
  ref_kind: 'card',
  ref_id,
  due_at,
  title: ref_id,
});

test('dailyQueue puts due items first (oldest first), then future by due_at asc', () => {
  const now = 1_000_000;
  const items = [
    item('future-late', now + 5_000),
    item('due-old', now - 9_000),
    item('future-soon', now + 1_000),
    item('due-now', now),
    item('due-recent', now - 1_000),
  ];
  const queue = dailyQueue(items, now);
  expect(queue.map((i) => i.ref_id)).toEqual([
    'due-old',
    'due-recent',
    'due-now',
    'future-soon',
    'future-late',
  ]);
});

test('dailyQueue does not mutate the input array', () => {
  const now = 1_000;
  const items = [item('b', now + 1), item('a', now - 1)];
  dailyQueue(items, now);
  expect(items.map((i) => i.ref_id)).toEqual(['b', 'a']);
});

test('dailyQueue handles empty input', () => {
  expect(dailyQueue([], 0)).toEqual([]);
});
