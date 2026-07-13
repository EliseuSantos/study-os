import { describe, expect, test } from 'bun:test';
import { applyFocusOrder, isoWeek } from '../src/planner';

describe('isoWeek', () => {
  test('known dates', () => {
    expect(isoWeek(Date.UTC(2026, 0, 1, 12))).toBe('2026-W01');
    expect(isoWeek(Date.UTC(2026, 6, 13, 12))).toBe('2026-W29');
    expect(isoWeek(Date.UTC(2025, 11, 29, 12))).toBe('2026-W01'); // ISO year rollover
  });
});

describe('applyFocusOrder', () => {
  const topics = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const now = Date.UTC(2026, 6, 13, 12); // 2026-W29

  test('focus topics float first in the matching week', () => {
    expect(applyFocusOrder(topics, ['c'], '2026-W29', now).map((t) => t.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  test('stale week is inert', () => {
    expect(applyFocusOrder(topics, ['c'], '2026-W28', now).map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(applyFocusOrder(topics, [], '2026-W29', now)).toEqual(topics);
    expect(applyFocusOrder(topics, ['c'], null, now)).toEqual(topics);
  });
});

describe('allocateSchedule with focus', () => {
  test('focused topic is planned first when deps allow', async () => {
    const { allocateSchedule } = await import('../src/planner');
    const day = 1_767_225_600_000; // a Thursday
    const dow = new Date(day).getDay();
    const topics = [
      { id: 't1', track_id: 'tr', title: 'A', status: 'pending' as const, position: 0, deps: [] },
      {
        id: 't2',
        track_id: 'tr',
        title: 'B',
        status: 'pending' as const,
        position: 1,
        deps: [],
        focused: true,
      },
    ];
    const blocks = allocateSchedule(
      [{ id: 'r1', track_id: 'tr', days: [dow], start_time: '08:00', duration_min: 60 }],
      topics,
      day,
      day,
    );
    expect(blocks[0]?.topic_id).toBe('t2');
  });
});
