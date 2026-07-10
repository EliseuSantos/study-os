import { decodeEntities } from './timedtext';
import { MAX_RESULTS, isRecord, type Connector, type ContentResult, type FetchLike } from './types';

const SEARCH_URL =
  'https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&order=desc&sort=relevance&q=';

export const stackexchangeConnector: Connector = {
  source: 'stackexchange',
  kind: 'qa',
  async search(q: string, fetchFn: FetchLike): Promise<ContentResult[]> {
    try {
      const res = await fetchFn(`${SEARCH_URL}${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const body: unknown = await res.json();
      if (!isRecord(body) || !Array.isArray(body.items)) return [];
      const results: ContentResult[] = [];
      for (const item of body.items) {
        if (results.length >= MAX_RESULTS) break;
        if (
          !isRecord(item) ||
          typeof item.question_id !== 'number' ||
          typeof item.title !== 'string' ||
          typeof item.link !== 'string'
        ) {
          continue;
        }
        results.push({
          source: 'stackexchange',
          external_id: String(item.question_id),
          url: item.link,
          title: decodeEntities(item.title),
          kind: 'qa',
          description: null,
          meta: {
            score: typeof item.score === 'number' ? item.score : null,
            answer_count: typeof item.answer_count === 'number' ? item.answer_count : null,
            is_answered: typeof item.is_answered === 'boolean' ? item.is_answered : null,
          },
        });
      }
      return results;
    } catch {
      return [];
    }
  },
};
