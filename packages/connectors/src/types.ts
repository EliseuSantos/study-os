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
