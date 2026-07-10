import { expect, test } from 'bun:test';
import {
  connectors,
  getConnector,
  stackexchangeConnector,
  webConnector,
  wikipediaConnector,
  youtubeConnector,
} from '../src';

test('registry has the stable order wikipedia, stackexchange, youtube, web', () => {
  expect(connectors.map((c) => c.source)).toEqual(['wikipedia', 'stackexchange', 'youtube', 'web']);
  expect(connectors.map((c) => c.kind)).toEqual(['article', 'qa', 'video', 'article']);
});

test('getConnector resolves each source to its connector', () => {
  expect(getConnector('wikipedia')).toBe(wikipediaConnector);
  expect(getConnector('stackexchange')).toBe(stackexchangeConnector);
  expect(getConnector('youtube')).toBe(youtubeConnector);
  expect(getConnector('web')).toBe(webConnector);
});

test('getConnector returns null for unknown sources', () => {
  expect(getConnector('vimeo')).toBeNull();
  expect(getConnector('')).toBeNull();
});
