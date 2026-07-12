import { decodeEntities } from './timedtext';
import {
  MAX_RESULTS,
  anchorTerm,
  isRecord,
  rankByRelevance,
  type Connector,
  type ContentResult,
  type FetchLike,
} from './types';

const SEARCH_URL =
  'https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=';
// Title-weighted search (the wiki search box): what a student means by the query.
const TITLE_URL = 'https://pt.wikipedia.org/w/rest.php/v1/search/title?limit=5&q=';

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function articleUrl(title: string): string {
  return `https://pt.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
}

/** v1/search/title hits: `{pages: [{id, title, description?, excerpt?}]}` */
async function titleResults(q: string, fetchFn: FetchLike): Promise<ContentResult[]> {
  const anchor = anchorTerm(q);
  if (anchor === null) return [];
  try {
    const res = await fetchFn(`${TITLE_URL}${encodeURIComponent(anchor)}`);
    if (!res.ok) return [];
    const body: unknown = await res.json();
    if (!isRecord(body) || !Array.isArray(body.pages)) return [];
    const results: ContentResult[] = [];
    for (const page of body.pages) {
      if (!isRecord(page) || typeof page.id !== 'number' || typeof page.title !== 'string') {
        continue;
      }
      const description = typeof page.description === 'string' ? page.description.trim() : '';
      results.push({
        source: 'wikipedia',
        external_id: String(page.id),
        url: articleUrl(page.title),
        title: page.title,
        kind: 'article',
        description: description === '' ? null : description,
        meta: { matched: 'title' },
      });
    }
    return results;
  } catch {
    return [];
  }
}

export const wikipediaConnector: Connector = {
  source: 'wikipedia',
  kind: 'article',
  async search(q: string, fetchFn: FetchLike): Promise<ContentResult[]> {
    // Two angles in parallel: title matches on the anchor term lead, full-text
    // completes. Merged by pageid, capped, then the relevance guard ranks.
    const [byTitle, byText] = await Promise.all([
      titleResults(q, fetchFn),
      (async (): Promise<ContentResult[]> => {
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
            if (
              !isRecord(item) ||
              typeof item.pageid !== 'number' ||
              typeof item.title !== 'string'
            ) {
              continue;
            }
            const snippet = typeof item.snippet === 'string' ? item.snippet : '';
            const description = decodeEntities(stripTags(snippet)).trim();
            results.push({
              source: 'wikipedia',
              external_id: String(item.pageid),
              url: articleUrl(item.title),
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
      })(),
    ]);

    const seen = new Set<string>();
    const merged: ContentResult[] = [];
    for (const result of [...byTitle, ...byText]) {
      if (seen.has(result.external_id)) continue;
      seen.add(result.external_id);
      merged.push(result);
      if (merged.length >= MAX_RESULTS) break;
    }
    return rankByRelevance(q, merged);
  },
};
