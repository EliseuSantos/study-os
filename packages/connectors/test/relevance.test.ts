import { describe, expect, test } from 'bun:test';
import { rankByRelevance, titleTermScore, type ContentResult } from '../src/index';

function result(title: string, description: string | null = null): ContentResult {
  return {
    source: 'wikipedia',
    external_id: title,
    url: 'https://example.com',
    title,
    kind: 'article',
    description,
    meta: {},
  };
}

describe('titleTermScore', () => {
  test('counts whole-word query terms in the title', () => {
    expect(titleTermScore('verbo to-be', 'Verbo to be')).toBe(3);
    expect(titleTermScore('verbo to-be', 'Conjugação do verbo ser')).toBe(1);
  });

  test('does not match substrings of other words', () => {
    expect(titleTermScore('verbo to-be', 'What do we mean by -Xdiags:verbos?')).toBe(0);
  });

  test('is accent-insensitive', () => {
    expect(titleTermScore('conjugacao', 'Conjugação verbal')).toBe(1);
  });
});

describe('rankByRelevance', () => {
  const exact = result('Verbo to be');
  const viaDescription = result('E-Prime', 'falar inglês sem usar o verbo ser, em inglês to be');
  const stopwordOnly = result('How to get Note info using GOVC comand?');
  const junk = result('Nodemon not restarting');

  test('drops results that never mention the anchor term', () => {
    expect(rankByRelevance('verbo to-be', [junk, stopwordOnly, viaDescription, exact])).toEqual([
      exact,
      viaDescription,
    ]);
  });

  test('ranks title mentions above description-only mentions', () => {
    expect(rankByRelevance('verbo to-be', [viaDescription, exact])).toEqual([
      exact,
      viaDescription,
    ]);
  });

  test('returns nothing when no result mentions the anchor', () => {
    expect(rankByRelevance('verbo to-be', [junk, stopwordOnly])).toEqual([]);
  });

  test('keeps upstream order between equal scores', () => {
    const a = result('Verbo regular');
    const b = result('Verbo irregular');
    expect(rankByRelevance('verbo', [a, b])).toEqual([a, b]);
  });
});
