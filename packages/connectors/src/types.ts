export type ContentKind = 'video' | 'article' | 'qa' | 'doc';

export interface ContentResult {
  source: string; // 'youtube' | 'wikipedia' | 'stackexchange'
  external_id: string;
  url: string;
  title: string;
  kind: ContentKind;
  description: string | null;
  meta: Record<string, unknown>; // thumbnails, score, duration... source-specific
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface Connector {
  source: string;
  kind: ContentKind;
  search(q: string, fetchFn: FetchLike): Promise<ContentResult[]>; // <= 10 results
}

export interface TranscriptCue {
  start: number;
  dur: number;
  text: string;
}

export const MAX_RESULTS = 10;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * How many query terms appear as whole words in the text (accent-insensitive).
 * Used to keep upstream full-text matches honest: "verbo to-be" must not
 * surface "-Xdiags:verbos".
 */
export function titleTermScore(q: string, title: string): number {
  const terms = queryTerms(q);
  if (terms.length === 0) return 0;
  const words = wordSet(title);
  return terms.filter((t) => words.has(t)).length;
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function queryTerms(q: string): string[] {
  return fold(q)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

function wordSet(text: string): Set<string> {
  return new Set(fold(text).split(/[^\p{L}\p{N}]+/u));
}

/** The informative term of a query — its longest word ("verbo" in "verbo to-be"). */
export function anchorTerm(q: string): string | null {
  const terms = queryTerms(q);
  if (terms.length === 0) return null;
  return terms.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Relevance guard over upstream full-text search. The longest query term is
 * the informative one ("verbo" in "verbo to-be"); results that never mention
 * it — title or description — are noise that only matched stopword-sized
 * terms, so they are dropped. Survivors are ranked by whole-word term hits
 * (title worth 3x a description hit), stable within ties. If nothing mentions
 * the anchor term, the source has nothing relevant — return empty rather than
 * confidently irrelevant.
 */
export function rankByRelevance(q: string, results: ContentResult[]): ContentResult[] {
  const terms = queryTerms(q);
  const anchor = anchorTerm(q);
  if (terms.length === 0 || anchor === null) return results;

  const scored = results.map((r, i) => {
    const title = wordSet(r.title);
    const desc = wordSet(r.description ?? '');
    const score =
      terms.filter((t) => title.has(t)).length * 3 + terms.filter((t) => desc.has(t)).length;
    return { r, i, mentionsAnchor: title.has(anchor) || desc.has(anchor), score };
  });

  return scored
    .filter((s) => s.mentionsAnchor)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.r);
}
