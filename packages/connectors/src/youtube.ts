import { MAX_RESULTS, isRecord, type Connector, type ContentResult, type FetchLike } from './types';

// App-relative proxy: the worker adds the API key (see docs/M4-CONTRACTS.md).
const SEARCH_URL = '/proxy/youtube/search?q=';

export const youtubeConnector: Connector = {
  source: 'youtube',
  kind: 'video',
  async search(q: string, fetchFn: FetchLike): Promise<ContentResult[]> {
    try {
      const res = await fetchFn(`${SEARCH_URL}${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const body: unknown = await res.json();
      if (!isRecord(body) || !Array.isArray(body.items)) return [];
      const results: ContentResult[] = [];
      for (const item of body.items) {
        if (results.length >= MAX_RESULTS) break;
        if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') {
          continue;
        }
        results.push({
          source: 'youtube',
          external_id: item.id,
          url: `https://www.youtube.com/watch?v=${item.id}`,
          title: item.title,
          kind: 'video',
          description: null,
          meta: {
            channel: typeof item.channel === 'string' ? item.channel : null,
            thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : null,
            duration: typeof item.duration === 'string' ? item.duration : null,
          },
        });
      }
      return results;
    } catch {
      return [];
    }
  },
};
