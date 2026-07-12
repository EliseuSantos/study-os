import { describe, expect, test } from 'bun:test';
import { makeAnchor, makeCloze, resolveAnchor, suggestCardFront } from '../src/annotations';

const TEXT = 'O controle difuso pode ser exercido por qualquer juiz ou tribunal do país.';

describe('makeAnchor', () => {
  test('captures offsets and quote', () => {
    const a = makeAnchor(TEXT, 2, 18);
    expect(a).toEqual({ start: 2, end: 18, quote: 'controle difuso ' });
  });
  test('rejects invalid ranges', () => {
    expect(makeAnchor(TEXT, 5, 5)).toBeNull();
    expect(makeAnchor(TEXT, -1, 4)).toBeNull();
    expect(makeAnchor(TEXT, 0, TEXT.length + 1)).toBeNull();
  });
  test('records segment index for transcripts', () => {
    expect(makeAnchor('abc def', 0, 3, 7)).toEqual({
      start: 0,
      end: 3,
      quote: 'abc',
      segment_index: 7,
    });
  });
});

describe('resolveAnchor', () => {
  test('exact when offsets still match', () => {
    const a = makeAnchor(TEXT, 2, 18);
    expect(resolveAnchor(TEXT, a!)).toEqual({ start: 2, end: 18, exact: true });
  });
  test('relocates by quote when offsets shifted', () => {
    const shifted = `PREFIXO ${TEXT}`;
    const a = makeAnchor(TEXT, 2, 18);
    expect(resolveAnchor(shifted, a!)).toEqual({ start: 10, end: 26, exact: false });
  });
  test('null when quote vanished', () => {
    const a = makeAnchor(TEXT, 2, 18);
    expect(resolveAnchor('outro texto qualquer', a!)).toBeNull();
  });
});

describe('suggestCardFront', () => {
  test('short quote used whole', () => {
    expect(suggestCardFront('poder constituinte')).toBe('Explique: poder constituinte');
  });
  test('long quote truncated with ellipsis', () => {
    const long = 'a'.repeat(80);
    expect(suggestCardFront(long).length).toBeLessThanOrEqual(70);
    expect(suggestCardFront(long).endsWith('…')).toBe(true);
  });
});

describe('makeCloze', () => {
  test('builds gap and bolded answer', () => {
    const c = makeCloze('O prazo é de 15 dias úteis.', 13, 20);
    expect(c).toEqual({
      front_md: 'O prazo é de […] úteis.',
      back_md: 'O prazo é de **15 dias** úteis.',
    });
  });
  test('rejects empty span', () => {
    expect(makeCloze('abc', 1, 1)).toBeNull();
  });
});
