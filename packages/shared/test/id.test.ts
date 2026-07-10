import { describe, expect, test } from 'bun:test';
import { newId } from '../src/id';

describe('newId', () => {
  test('returns a uuidv7', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('is time-ordered', () => {
    const ids = Array.from({ length: 100 }, () => newId());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});
