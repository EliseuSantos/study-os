import { decodeEntities } from './timedtext';
import { MAX_RESULTS, isRecord, type Connector, type ContentResult, type FetchLike } from './types';

const SEARCH_URL =
  'https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=';

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export const wikipediaConnector: Connector = {
  source: 'wikipedia',
  kind: 'article',
  async search(q: string, fetchFn: FetchLike): Promise<ContentResult[]> {
    try {
      const res = await fetchFn(`${SEARCH_URL}${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const body: unknown = await res.json();
      if (!isRecord(body) || !isRecord(body.query) || !Array.isArray(body.query.search)) {
        return [];
      }
      const results: ContentResult[] = [];
      for (const item of body.query.search) {
        if (results.length >= MAX_RESULTS) break;
        if (!isRecord(item) || typeof item.pageid !== 'number' || typeof item.title !== 'string') {
          continue;
        }
        const snippet = typeof item.snippet === 'string' ? item.snippet : '';
        const description = decodeEntities(stripTags(snippet)).trim();
        results.push({
          source: 'wikipedia',
          external_id: String(item.pageid),
          url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
          title: item.title,
          kind: 'article',
          description: description === '' ? null : description,
          meta: {
            snippet,
            wordcount: typeof item.wordcount === 'number' ? item.wordcount : null,
          },
        });
      }
      return results;
    } catch {
      return [];
    }
  },
};
