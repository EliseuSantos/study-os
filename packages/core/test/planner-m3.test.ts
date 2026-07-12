import { describe, expect, test } from 'bun:test';
import {
  DAY_MS,
  allocateSchedule,
  buildToday,
  cycleNext,
  parseRrule,
  replan,
  routineOccurrences,
  type CycleSlotSpec,
  type PlannerTopic,
  type RoutineSpec,
  type TodayInputs,
  forecastReviewLoad,
} from '../src/planner';

// Local midnight of 2026-01-<d> — TZ-portable because tests and core both use
// the environment's local zone. 2026-01-05 is a Monday.
const day = (d: number): number => new Date(2026, 0, d).getTime();

const routine = (partial: Partial<RoutineSpec> & { id: string }): RoutineSpec => ({
  track_id: null,
  days: [1, 2, 3, 4, 5],
  start_time: '08:00',
  duration_min: 60,
  ...partial,
});

const topic = (partial: Partial<PlannerTopic> & { id: string }): PlannerTopic => ({
  track_id: 't1',
  title: partial.id,
  status: 'pending',
  position: 0,
  deps: [],
  ...partial,
});

describe('parseRrule', () => {
  test('parses weekly BYDAY subsets in any order, sorted output', () => {
    expect(parseRrule('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual([1, 3, 5]);
    expect(parseRrule('FREQ=WEEKLY;BYDAY=SA,SU')).toEqual([0, 6]);
    expect(parseRrule('BYDAY=TU;FREQ=WEEKLY')).toEqual([2]);
    expect(parseRrule('FREQ=WEEKLY;INTERVAL=1;BYDAY=SU,MO,TU,WE,TH,FR,SA')).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  test('throws on anything outside the subset', () => {
    const bad = [
      'FREQ=DAILY;BYDAY=MO',
      'FREQ=WEEKLY;BYDAY=MO;INTERVAL=2',
      'FREQ=WEEKLY',
      'FREQ=WEEKLY;BYDAY=MO,XX',
      'FREQ=WEEKLY;BYDAY=MO;COUNT=5',
      'BYDAY=MO',
      '',
    ];
    for (const rrule of bad) {
      expect(() => parseRrule(rrule)).toThrow('unsupported rrule');
    }
  });
});

describe('routineOccurrences', () => {
  test('expands over two weeks with a subset of days', () => {
    const r = routine({ id: 'r1', days: [1, 3] }); // Mon, Wed
    // Mon Jan 5 .. Sun Jan 18
    expect(routineOccurrences(r, day(5), day(18))).toEqual([day(5), day(7), day(12), day(14)]);
  });

  test('inclusive bounds and empty result', () => {
    const r = routine({ id: 'r1', days: [1] });
    expect(routineOccurrences(r, day(5), day(5))).toEqual([day(5)]);
    expect(routineOccurrences(r, day(6), day(11))).toEqual([]);
  });
});

describe('allocateSchedule', () => {
  test('respects deps before position, skips done, cycles when exhausted', () => {
    const topics = [
      topic({ id: 'B', position: 0, deps: ['A'] }),
      topic({ id: 'A', position: 1 }),
      topic({ id: 'C', position: 2, status: 'done' }),
      topic({ id: 'D', position: 3 }),
    ];
    const r = routine({ id: 'r1', track_id: 't1', days: [1, 2, 3, 4, 5] });
    // Mon..Fri = 5 occurrences over A, B, D then cycle from the start.
    const blocks = allocateSchedule([r], topics, day(5), day(9));
    expect(blocks.map((b) => b.topic_id)).toEqual(['A', 'B', 'D', 'A', 'B']);
    expect(blocks.map((b) => b.day)).toEqual([day(5), day(6), day(7), day(8), day(9)]);
    expect(blocks.every((b) => b.routine_id === 'r1' && b.duration_min === 60)).toBe(true);
  });

  test('same-track routines share one cursor; different tracks are independent', () => {
    const topics = [
      topic({ id: 'A', track_id: 't1', position: 0 }),
      topic({ id: 'B', track_id: 't1', position: 1 }),
      topic({ id: 'X', track_id: 't2', position: 0 }),
    ];
    const routines = [
      routine({ id: 'r-am', track_id: 't1', days: [1], start_time: '08:00' }),
      routine({ id: 'r-pm', track_id: 't1', days: [1], start_time: '14:00' }),
      routine({ id: 'r-t2', track_id: 't2', days: [1], start_time: '10:00' }),
    ];
    const blocks = allocateSchedule(routines, topics, day(5), day(5));
    // Within the day, blocks are ordered by start_time.
    expect(blocks.map((b) => b.routine_id)).toEqual(['r-am', 'r-t2', 'r-pm']);
    expect(blocks.map((b) => b.topic_id)).toEqual(['A', 'X', 'B']);
  });

  test('track-less routines and exhausted tracks produce estudo livre blocks', () => {
    const routines = [
      routine({ id: 'free', track_id: null, days: [1] }),
      routine({ id: 'done-track', track_id: 't9', days: [1], start_time: '09:00' }),
    ];
    const topics = [topic({ id: 'Z', track_id: 't9', status: 'done' })];
    const blocks = allocateSchedule(routines, topics, day(5), day(5));
    expect(blocks.map((b) => b.title)).toEqual(['estudo livre', 'estudo livre']);
    expect(blocks.map((b) => b.topic_id)).toEqual([null, null]);
  });
});

describe('cycleNext', () => {
  test('weights expand as consecutive turns per cycle and the pointer wraps', () => {
    const slots: CycleSlotSpec[] = [
      { id: 'b', topic_id: 'tb', title: 'B', weight: 1, position: 1 },
      { id: 'a', topic_id: 'ta', title: 'A', weight: 2, position: 0 },
    ];
    const picks: string[] = [];
    let pointer = 0;
    for (let i = 0; i < 6; i++) {
      const next = cycleNext(slots, pointer);
      if (next === null) throw new Error('unexpected null');
      picks.push(next.slot.id);
      expect(next.nextPointer).toBe(pointer + 1);
      pointer = next.nextPointer;
    }
    expect(picks).toEqual(['a', 'a', 'b', 'a', 'a', 'b']);
  });

  test('returns null with no usable slots; skips weight < 1', () => {
    expect(cycleNext([], 0)).toBeNull();
    const slots: CycleSlotSpec[] = [
      { id: 'a', topic_id: 'ta', title: 'A', weight: 0, position: 0 },
      { id: 'b', topic_id: 'tb', title: 'B', weight: 1, position: 1 },
    ];
    const next = cycleNext(slots, 5);
    expect(next?.slot.id).toBe('b');
  });
});

describe('replan', () => {
  test('never emits past days and is idempotent', () => {
    const r = routine({ id: 'r1', track_id: 't1', days: [0, 1, 2, 3, 4, 5, 6] });
    const topics = [topic({ id: 'A' }), topic({ id: 'B', position: 1 })];
    const today = day(7);
    const first = replan([r], topics, today, 5);
    const second = replan([r], topics, today, 5);
    expect(first).toEqual(second);
    expect(first.length).toBe(5);
    expect(first.every((b) => b.day >= today)).toBe(true);
    expect(first[first.length - 1]?.day).toBe(today + 4 * DAY_MS);
  });

  test('empty horizon produces nothing', () => {
    expect(replan([routine({ id: 'r1' })], [], day(5), 0)).toEqual([]);
  });
});

describe('buildToday', () => {
  test('orders overdue reviews, due reminders, blocks, fresh reviews', () => {
    const now = day(7) + 12 * 3_600_000; // Wed noon
    const inputs: TodayInputs = {
      due: [
        { refKind: 'card', refId: 'c-fresh', title: 'fresh card', dueAt: now + 3_600_000 },
        { refKind: 'topic', refId: 't-old', title: 'old topic', dueAt: now - 2 * DAY_MS },
        { refKind: 'card', refId: 'c-new', title: 'new card', dueAt: null },
        { refKind: 'card', refId: 'c-late', title: 'late card', dueAt: now - 3_600_000 },
      ],
      blocks: [
        {
          day: day(7),
          routine_id: 'r1',
          track_id: 't1',
          topic_id: 'A',
          title: 'A',
          duration_min: 90,
        },
        {
          day: day(7),
          routine_id: 'r2',
          track_id: null,
          topic_id: null,
          title: 'estudo livre',
          duration_min: 45,
        },
      ],
      reminders: [
        { id: 'rem-future', title: 'depois', notify_at: now + 60_000 },
        { id: 'rem-due', title: 'simulado', notify_at: now - 60_000 },
      ],
    };
    const items = buildToday(inputs, now);
    expect(items.map((i) => `${i.kind}:${i.title}`)).toEqual([
      'review:old topic',
      'review:late card',
      'reminder:simulado',
      'block:A',
      'block:estudo livre',
      'review:fresh card',
      'review:new card',
    ]);
    expect(items.map((i) => i.sort)).toEqual([0, 1, 100, 200, 201, 300, 301]);
  });

  test('hrefs and subtitles follow the contract copy', () => {
    const now = day(7);
    const items = buildToday(
      {
        due: [{ refKind: 'topic', refId: 't1', title: 'x', dueAt: now - 1 }],
        blocks: [
          {
            day: now,
            routine_id: 'r1',
            track_id: null,
            topic_id: null,
            title: 'estudo livre',
            duration_min: 120,
          },
        ],
        reminders: [{ id: 'rem', title: 'y', notify_at: now }],
      },
      now,
    );
    expect(items.map((i) => i.href)).toEqual(['/review', '/routines', '/study']);
    expect(items.map((i) => i.subtitle)).toEqual(['revisão', 'lembrete', '2h de estudo']);
  });

  test('block subtitle formats hours and minutes', () => {
    const now = day(7);
    const block = (duration_min: number) => ({
      day: now,
      routine_id: 'r',
      track_id: null,
      topic_id: null,
      title: 'estudo livre',
      duration_min,
    });
    const items = buildToday({ due: [], reminders: [], blocks: [block(90), block(45)] }, now);
    expect(items.map((i) => i.subtitle)).toEqual(['1h30 de estudo', '45min de estudo']);
  });
});

describe('forecastReviewLoad (M10)', () => {
  const DAY = 86_400_000;
  const today = 1_700_000_000_000;
  test('buckets dues per day inside the horizon', () => {
    const dues = [
      { dueAt: today + 1000 },
      { dueAt: today + DAY + 5 },
      { dueAt: today + DAY + 6 },
      { dueAt: today + 9 * DAY },
      { dueAt: null },
      { dueAt: today - DAY },
    ];
    expect(forecastReviewLoad(dues, today, 7)).toEqual([1, 2, 0, 0, 0, 0, 0]);
  });
});
