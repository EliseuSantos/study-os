import { describe, expect, test } from 'bun:test';
import {
  buildSnapshot,
  parseSnapshot,
  snapshotHash,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  type BuildSnapshotInput,
  type TrackSnapshot,
} from '../src/snapshot';

const EXPORTED_AT = 1_767_225_600_000;

// Fixture rows: 2 roots, one with 2 children (positions deliberately out of
// input order), a lesson with a topic item, a content item and a quiz item.
const input = (): BuildSnapshotInput => ({
  track: { title: 'Trilha teste', description: 'desc', mode: 'schedule' },
  topics: [
    { id: 't-b', parent_id: null, title: 'Raiz B', notes_md: null, position: 1 },
    { id: 't-a2', parent_id: 't-a', title: 'Filho A2', notes_md: null, position: 1 },
    { id: 't-a', parent_id: null, title: 'Raiz A', notes_md: 'notas', position: 0 },
    { id: 't-a1', parent_id: 't-a', title: 'Filho A1', notes_md: null, position: 0 },
  ],
  cards: [
    {
      topic_id: 't-a1',
      kind: 'basic',
      front_md: 'frente',
      back_md: 'verso',
      options_json: null,
    },
  ],
  lessons: [
    {
      id: 'l-1',
      title: 'Aula 1',
      presenter_notes_md: 'roteiro',
      estimated_duration_min: 45,
      position: 0,
    },
  ],
  lessonItems: [
    {
      lesson_id: 'l-1',
      topic_id: 't-a',
      content_item_id: null,
      kind: 'topic',
      body_md: null,
      position: 0,
    },
    {
      lesson_id: 'l-1',
      topic_id: null,
      content_item_id: 'c-1',
      kind: 'content',
      body_md: null,
      position: 1,
    },
    {
      lesson_id: 'l-1',
      topic_id: null,
      content_item_id: null,
      kind: 'quiz',
      body_md: '{"q":"?","options":["a","b"],"answer":0}',
      position: 2,
    },
  ],
  content: [
    {
      id: 'c-1',
      topic_id: 't-a1',
      source: 'youtube',
      external_id: 'abc',
      url: 'https://youtu.be/abc',
      title: 'Vídeo A1',
      kind: 'video',
    },
  ],
});

describe('buildSnapshot', () => {
  test('assigns ordinal topic keys parents-first by position and maps parent keys', () => {
    const s = buildSnapshot(input(), EXPORTED_AT);
    expect(s.format).toBe(SNAPSHOT_FORMAT);
    expect(s.version).toBe(SNAPSHOT_VERSION);
    expect(s.exported_at).toBe(EXPORTED_AT);
    // Pre-order: Raiz A (0) → A1 (1) → A2 (2), Raiz B (3).
    expect(s.topics.map((t) => [t.key, t.title, t.parent_key])).toEqual([
      [0, 'Raiz A', null],
      [1, 'Filho A1', 0],
      [2, 'Filho A2', 0],
      [3, 'Raiz B', null],
    ]);
    expect(s.cards).toEqual([
      { topic_key: 1, kind: 'basic', front_md: 'frente', back_md: 'verso', options_json: null },
    ]);
    expect(s.lessons[0]).toEqual({
      key: 0,
      title: 'Aula 1',
      presenter_notes_md: 'roteiro',
      estimated_duration_min: 45,
      position: 0,
    });
    expect(s.content).toEqual([
      {
        topic_key: 1,
        source: 'youtube',
        external_id: 'abc',
        url: 'https://youtu.be/abc',
        title: 'Vídeo A1',
        kind: 'video',
      },
    ]);
  });

  test("converts kind 'content' lesson items to 'note' with a markdown link body", () => {
    const s = buildSnapshot(input(), EXPORTED_AT);
    expect(s.lesson_items[1]).toEqual({
      lesson_key: 0,
      topic_key: null,
      kind: 'note',
      body_md: '[Vídeo A1](https://youtu.be/abc)',
      position: 1,
    });
    // Non-content kinds pass through untouched.
    expect(s.lesson_items[0]?.kind).toBe('topic');
    expect(s.lesson_items[0]?.topic_key).toBe(0);
    expect(s.lesson_items[2]?.kind).toBe('quiz');
  });

  test('build → parse roundtrip is lossless', () => {
    const s = buildSnapshot(input(), EXPORTED_AT);
    expect(parseSnapshot(JSON.stringify(s))).toEqual(s);
  });
});

describe('snapshotHash', () => {
  const snapshot = (): TrackSnapshot => buildSnapshot(input(), EXPORTED_AT);

  test('is a 16-hex string', () => {
    expect(snapshotHash(snapshot())).toMatch(/^[0-9a-f]{16}$/);
  });

  test('is stable across object key order and exported_at changes', () => {
    const a = snapshot();
    // Same content, different exported_at and reversed key insertion order.
    const shuffled = JSON.parse(
      JSON.stringify({
        content: a.content,
        lesson_items: a.lesson_items,
        lessons: a.lessons,
        cards: a.cards,
        topics: a.topics.map((t) => ({
          position: t.position,
          notes_md: t.notes_md,
          title: t.title,
          parent_key: t.parent_key,
          key: t.key,
        })),
        track: { mode: a.track.mode, description: a.track.description, title: a.track.title },
        exported_at: EXPORTED_AT + 999_999,
        version: a.version,
        format: a.format,
      }),
    ) as TrackSnapshot;
    expect(snapshotHash(shuffled)).toBe(snapshotHash(a));
  });

  test('differs when content changes', () => {
    const a = snapshot();
    const b = snapshot();
    b.topics[0]!.title = 'Raiz A editada';
    expect(snapshotHash(b)).not.toBe(snapshotHash(a));
  });
});

describe('parseSnapshot', () => {
  const valid = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(buildSnapshot(input(), EXPORTED_AT))) as Record<string, unknown>;
  const parse = (mutate: (s: Record<string, unknown>) => void): (() => TrackSnapshot) => {
    const s = valid();
    mutate(s);
    return () => parseSnapshot(JSON.stringify(s));
  };

  test('rejects non-JSON and non-object roots', () => {
    expect(() => parseSnapshot('nope{')).toThrow(/^invalid snapshot: /);
    expect(() => parseSnapshot('[1,2]')).toThrow(/^invalid snapshot: /);
  });

  test('rejects bad format literal', () => {
    expect(parse((s) => (s['format'] = 'studyos-goal'))).toThrow(
      "invalid snapshot: format must be 'studyos-track'",
    );
  });

  test('rejects bad version literal', () => {
    expect(parse((s) => (s['version'] = 2))).toThrow('invalid snapshot: version must be 1');
  });

  test('rejects missing arrays', () => {
    for (const key of ['topics', 'cards', 'lessons', 'lesson_items', 'content']) {
      expect(parse((s) => delete s[key])).toThrow(`invalid snapshot: ${key} must be an array`);
    }
  });

  test('rejects wrong key types', () => {
    expect(
      parse((s) => {
        (s['topics'] as { key: unknown }[])[0]!.key = '0';
      }),
    ).toThrow('invalid snapshot: topics[0].key must be an integer >= 0');
    expect(
      parse((s) => {
        (s['topics'] as { key: unknown }[])[0]!.key = 1.5;
      }),
    ).toThrow(/invalid snapshot: /);
    expect(
      parse((s) => {
        (s['cards'] as { topic_key: unknown }[])[0]!.topic_key = -1;
      }),
    ).toThrow('invalid snapshot: cards[0].topic_key must be an integer >= 0');
    expect(
      parse((s) => {
        (s['lesson_items'] as { lesson_key: unknown }[])[0]!.lesson_key = null;
      }),
    ).toThrow('invalid snapshot: lesson_items[0].lesson_key must be an integer >= 0');
  });

  test('rejects empty track title and wrong field types', () => {
    expect(parse((s) => ((s['track'] as { title: string }).title = '  '))).toThrow(
      'invalid snapshot: track.title must not be empty',
    );
    expect(parse((s) => (s['exported_at'] = 'ontem'))).toThrow(
      'invalid snapshot: exported_at must be a finite number',
    );
    expect(
      parse((s) => {
        (s['topics'] as { notes_md: unknown }[])[0]!.notes_md = 7;
      }),
    ).toThrow('invalid snapshot: topics[0].notes_md must be a string or null');
  });

  test('rejects dangling and duplicate keys', () => {
    expect(
      parse((s) => {
        (s['topics'] as { parent_key: unknown }[])[1]!.parent_key = 99;
      }),
    ).toThrow('invalid snapshot: topics[1].parent_key 99 does not exist');
    expect(
      parse((s) => {
        (s['cards'] as { topic_key: unknown }[])[0]!.topic_key = 99;
      }),
    ).toThrow('invalid snapshot: cards[0].topic_key 99 does not exist');
    expect(
      parse((s) => {
        (s['topics'] as { key: unknown }[])[1]!.key = 0;
      }),
    ).toThrow(/invalid snapshot: topics\[1\]\.key 0 is duplicated/);
  });

  test('strips unknown extra fields', () => {
    const s = valid();
    s['extra'] = true;
    (s['topics'] as Record<string, unknown>[])[0]!['uuid'] = 'leak';
    const parsed = parseSnapshot(JSON.stringify(s));
    expect('extra' in parsed).toBe(false);
    expect('uuid' in parsed.topics[0]!).toBe(false);
  });
});
