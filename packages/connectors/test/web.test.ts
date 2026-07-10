import { describe, expect, test } from 'bun:test';
import { webConnector } from '../src/web';
import type { FetchLike } from '../src/types';

const FIXTURE = {
  items: [
    {
      url: 'https://exemplo.com/controle-difuso',
      title: 'Controle difuso de constitucionalidade',
      description: 'Panorama do controle difuso.',
    },
    { url: 'https://outro.com/a', title: 'Sem descrição', description: null },
    { title: 'sem url — pulado' },
  ],
};

function stub(status: number, body: unknown): FetchLike {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

describe('webConnector', () => {
  test('maps the proxy wire format', async () => {
    let requested = '';
    const fetchFn: FetchLike = async (url) => {
      requested = url;
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    };
    const results = await webConnector.search('controle difuso', fetchFn);
    expect(requested).toBe('/proxy/firecrawl/search?q=controle%20difuso');
    expect(results).toHaveLength(2);
    expect(results[0]?.source).toBe('web');
    expect(results[0]?.kind).toBe('article');
    expect(results[0]?.external_id).toBe('https://exemplo.com/controle-difuso');
    expect(results[0]?.description).toBe('Panorama do controle difuso.');
    expect(results[1]?.description).toBeNull();
  });

  test('caps at 10 results', async () => {
    const many = {
      items: Array.from({ length: 12 }, (_, i) => ({
        url: `https://exemplo.com/${i}`,
        title: `Artigo ${i}`,
      })),
    };
    const results = await webConnector.search('x', stub(200, many));
    expect(results).toHaveLength(10);
  });

  test('non-2xx (503 unconfigured, 429 over budget) and malformed bodies return empty', async () => {
    expect(await webConnector.search('x', stub(503, { error: 'nope' }))).toEqual([]);
    expect(await webConnector.search('x', stub(429, { error: 'limit' }))).toEqual([]);
    expect(await webConnector.search('x', stub(200, { wrong: true }))).toEqual([]);
    const throwing: FetchLike = async () => {
      throw new Error('offline');
    };
    expect(await webConnector.search('x', throwing)).toEqual([]);
  });
});
