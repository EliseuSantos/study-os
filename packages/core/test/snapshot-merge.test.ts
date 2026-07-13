import { describe, expect, test } from 'bun:test';
import { buildSnapshot, parseSnapshot, planSnapshotMerge } from '../src/snapshot';

describe('snapshot sid + content_version round-trip', () => {
  test('build includes sids and version; parse keeps them', () => {
    const snap = buildSnapshot(
      {
        track: { title: 'T', description: null, mode: 'schedule' },
        topics: [
          { id: 'uuid-a', parent_id: null, title: 'A', notes_md: null, position: 0 },
          { id: 'uuid-b', parent_id: 'uuid-a', title: 'B', notes_md: null, position: 0 },
        ],
        cards: [],
        lessons: [],
        lessonItems: [],
        content: [],
      },
      1000,
      3,
    );
    expect(snap.content_version).toBe(3);
    expect(snap.topics.map((t) => t.sid)).toEqual(['uuid-a', 'uuid-b']);
    const round = parseSnapshot(JSON.stringify(snap));
    expect(round.content_version).toBe(3);
    expect(round.topics[1]?.sid).toBe('uuid-b');
  });

  test('old snapshots without sid/version still parse', () => {
    const snap = buildSnapshot(
      {
        track: { title: 'T', description: null, mode: 'schedule' },
        topics: [{ id: 'x', parent_id: null, title: 'A', notes_md: null, position: 0 }],
        cards: [],
        lessons: [],
        lessonItems: [],
        content: [],
      },
      1000,
    );
    const raw = JSON.parse(JSON.stringify(snap)) as Record<string, unknown>;
    delete raw['content_version'];
    for (const t of raw['topics'] as Record<string, unknown>[]) delete t['sid'];
    const parsed = parseSnapshot(JSON.stringify(raw));
    expect(parsed.content_version === undefined).toBe(true);
    expect(parsed.topics[0]?.sid === undefined).toBe(true);
  });
});

describe('planSnapshotMerge', () => {
  const incoming = [
    { key: 0, parent_key: null, sid: 'sid-1', title: 'Princípios', notes_md: null, position: 0 },
    { key: 1, parent_key: null, sid: 'sid-2', title: 'Controle renomeado', notes_md: null, position: 1 },
    { key: 2, parent_key: null, sid: 'sid-9', title: 'Tópico novo', notes_md: null, position: 2 },
  ];

  test('matches by origin_key, then title; adds and removes the rest', () => {
    const local = [
      { id: 'l1', title: 'Princípios', origin_key: 'sid-1' },
      { id: 'l2', title: 'Controle antigo', origin_key: 'sid-2' }, // renamed upstream, sid wins
      { id: 'l3', title: 'Removido no edital', origin_key: 'sid-3' },
    ];
    const plan = planSnapshotMerge(local, incoming);
    expect(plan.matched.map((m) => m.localId)).toEqual(['l1', 'l2']);
    expect(plan.matched[1]?.topic.title).toBe('Controle renomeado');
    expect(plan.added.map((t) => t.sid)).toEqual(['sid-9']);
    expect(plan.removed).toEqual(['l3']);
  });

  test('title fallback for pre-sid imports', () => {
    const local = [{ id: 'l1', title: '  princípios ', origin_key: null }];
    const plan = planSnapshotMerge(local, incoming);
    expect(plan.matched).toEqual([{ localId: 'l1', topic: incoming[0] }]);
    expect(plan.added.length).toBe(2);
    expect(plan.removed).toEqual([]);
  });
});
