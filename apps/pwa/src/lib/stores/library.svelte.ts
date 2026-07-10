import { dev } from '$app/environment';
import { getConnector, type ContentResult, type FetchLike } from '@studyos/connectors';
import {
  attachContent,
  getOrCreateDeviceId,
  getSetting,
  listTopics,
  listTracks,
} from '@studyos/db';
import { SETTINGS_KEYS, type TopicRow, type TrackRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';

export const SOURCES = ['wikipedia', 'stackexchange', 'youtube', 'web'] as const;
export type Source = (typeof SOURCES)[number];
export type SourceFilter = 'all' | Source;

export const SOURCE_LABELS: Record<Source, string> = {
  wikipedia: 'wikipédia',
  stackexchange: 'stack exchange',
  youtube: 'youtube',
  web: 'web',
};

export const KIND_LABELS: Record<string, string> = {
  video: 'vídeo',
  article: 'artigo',
  qa: 'pergunta',
  doc: 'documento',
};

// Same token policy as lib/sync: stored sync token, dev fallback in dev builds.
async function getToken(): Promise<string | null> {
  const db = await getDb();
  const stored = await getSetting(db, SETTINGS_KEYS.syncToken);
  if (stored) return stored;
  return dev ? 'dev-token' : null;
}

/** fetch with the sync bearer token — required by the worker's /proxy/* routes. */
export const authedFetch: FetchLike = async (url, init) => {
  const token = await getToken();
  const headers = new Headers(init?.headers);
  if (token !== null) headers.set('authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
};

export interface SourceGroup {
  source: Source;
  results: ContentResult[];
}

const plainFetch: FetchLike = (url, init) => fetch(url, init);

async function loadTopics(trackId: string): Promise<TopicRow[]> {
  const db = await getDb();
  return listTopics(db, trackId);
}

async function attach(result: ContentResult, topicId: string): Promise<void> {
  const db = await getDb();
  const deviceId = await getOrCreateDeviceId(db);
  await attachContent(db, deviceId, {
    topic_id: topicId,
    source: result.source,
    external_id: result.external_id,
    url: result.url,
    title: result.title,
    kind: result.kind,
    meta_json: JSON.stringify(result.meta),
  });
}

export interface LibraryStore {
  get status(): 'idle' | 'loading' | 'done';
  get groups(): SourceGroup[];
  get youtubeUnavailable(): boolean;
  get webUnavailable(): boolean;
  get webOverBudget(): boolean;
  get filter(): SourceFilter;
  get tracks(): TrackRow[];
  setFilter(next: SourceFilter): void;
  search(q: string): Promise<void>;
  loadTopics(trackId: string): Promise<TopicRow[]>;
  attach(result: ContentResult, topicId: string): Promise<void>;
  destroy(): void;
}

export function createLibraryStore(): LibraryStore {
  let status = $state<'idle' | 'loading' | 'done'>('idle');
  let groups = $state<SourceGroup[]>([]);
  let youtubeUnavailable = $state(false);
  let webUnavailable = $state(false);
  let webOverBudget = $state(false);
  let filter = $state<SourceFilter>('all');
  // Guards against a slow earlier search overwriting a newer one.
  let searchSeq = 0;

  const tracksLive = liveQuery((db) => listTracks(db), ['tracks'], [] as TrackRow[]);

  async function search(q: string): Promise<void> {
    const query = q.trim();
    if (query === '') return;
    const seq = ++searchSeq;
    status = 'loading';

    const enabled = SOURCES.filter((source) => filter === 'all' || filter === source);
    let youtubeStatus: number | null = null;
    // The youtube connector goes through the worker proxy: it needs the bearer
    // token, and recording the response status lets us tell "no results" apart
    // from "proxy not configured" (503).
    const youtubeFetch: FetchLike = async (url, init) => {
      const res = await authedFetch(url, init);
      youtubeStatus = res.status;
      return res;
    };
    // Same trick for the web source: 503 = not configured, 429 = monthly
    // firecrawl budget exhausted (free plan) — each gets its own calm note.
    let webStatus: number | null = null;
    const webFetch: FetchLike = async (url, init) => {
      const res = await authedFetch(url, init);
      webStatus = res.status;
      return res;
    };

    const settled = await Promise.allSettled(
      enabled.map((source) => {
        const connector = getConnector(source);
        if (connector === null) return Promise.resolve<ContentResult[]>([]);
        const fetchFn =
          source === 'youtube' ? youtubeFetch : source === 'web' ? webFetch : plainFetch;
        return connector.search(query, fetchFn);
      }),
    );
    if (seq !== searchSeq) return;

    groups = enabled.map((source, i) => {
      const outcome = settled[i];
      return { source, results: outcome?.status === 'fulfilled' ? outcome.value : [] };
    });
    youtubeUnavailable = youtubeStatus === 503;
    webUnavailable = webStatus === 503;
    webOverBudget = webStatus === 429;
    status = 'done';
  }

  return {
    get status() {
      return status;
    },
    get groups() {
      return groups;
    },
    get youtubeUnavailable() {
      return youtubeUnavailable;
    },
    get webUnavailable() {
      return webUnavailable;
    },
    get webOverBudget() {
      return webOverBudget;
    },
    get filter() {
      return filter;
    },
    get tracks() {
      return tracksLive.value;
    },
    setFilter(next: SourceFilter) {
      filter = next;
    },
    search,
    loadTopics,
    attach,
    destroy() {
      tracksLive.destroy();
    },
  };
}
