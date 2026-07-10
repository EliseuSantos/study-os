import { MAX_RESULTS, isRecord, type Connector, type ContentResult, type FetchLike } from './types';

// App-relative proxy: the worker adds the Firecrawl key and enforces the
// free-plan monthly budget (docs in apps/worker/README.md).
const SEARCH_URL = '/proxy/firecrawl/search?q=';

export const webConnector: Connector = {
  source: 'web',
  kind: 'article',
  async search(q: string, fetchFn: FetchLike): Promise<ContentResult[]> {
    try {
      const res = await fetchFn(`${SEARCH_URL}${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const body: unknown = await res.json();
      if (!isRecord(body) || !Array.isArray(body.items)) return [];
      const results: ContentResult[] = [];
      for (const item of body.items) {
        if (results.length >= MAX_RESULTS) break;
        if (!isRecord(item) || typeof item.url !== 'string' || typeof item.title !== 'string') {
          continue;
        }
        results.push({
          source: 'web',
          external_id: item.url,
          url: item.url,
          title: item.title,
          kind: 'article',
          description: typeof item.description === 'string' ? item.description : null,
          meta: {},
        });
      }
      return results;
    } catch {
      return [];
    }
  },
};
