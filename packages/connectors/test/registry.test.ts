import { expect, test } from 'bun:test';
import { registry, type Connector } from '../src';

test('registry starts empty and accepts connectors', async () => {
  expect(registry.size).toBe(0);

  const fake: Connector = {
    source: 'fake',
    search: () => Promise.resolve([]),
    resolve: () => Promise.resolve(null),
  };
  registry.set(fake.source, fake);
  expect(registry.size).toBe(1);
  expect(await registry.get('fake')?.search('query')).toEqual([]);

  registry.delete(fake.source);
  expect(registry.size).toBe(0);
});
