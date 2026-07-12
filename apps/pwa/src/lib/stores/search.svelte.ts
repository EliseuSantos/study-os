import { browser } from '$app/environment';
import {
  getCard,
  getContent,
  getTopic,
  reindexAll,
  searchLocal,
  type SearchHit,
} from '@studyos/db';
import { DB_CHANNEL } from '@studyos/shared';
import { getDb } from '$lib/db/client';
import type { DbBroadcast } from '$lib/db/rpc';

const REINDEX_TABLES = new Set(['topics', 'cards', 'content_items']);
const REINDEX_DEBOUNCE_MS = 1000;
const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_LIMIT = 8;

// Module singleton: one channel per tab keeps the fts index fresh after
// writes to the indexed tables (repos don't maintain it incrementally in M4).
let reindexWatcherStarted = false;

function startReindexWatcher(): void {
  if (!browser || reindexWatcherStarted) return;
  reindexWatcherStarted = true;
  const channel = new BroadcastChannel(DB_CHANNEL);
  let timer: ReturnType<typeof setTimeout> | null = null;
  channel.addEventListener('message', (event: MessageEvent<DbBroadcast>) => {
    const message = event.data;
    if (message.kind !== 'tables-changed') return;
    if (!message.tables.some((t) => REINDEX_TABLES.has(t))) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void getDb()
        .then((db) => reindexAll(db))
        .catch(() => {});
    }, REINDEX_DEBOUNCE_MS);
  });
}

async function resolveHref(hit: SearchHit): Promise<string | null> {
  const db = await getDb();
  if (hit.kind === 'topic') {
    const topic = await getTopic(db, hit.ref_id);
    return topic === null ? null : `/tracks/${topic.track_id}`;
  }
  if (hit.kind === 'card') {
    const card = await getCard(db, hit.ref_id);
    if (card === null) return null;
    const topic = await getTopic(db, card.topic_id);
    return topic === null ? null : `/tracks/${topic.track_id}`;
  }
  const content = await getContent(db, hit.ref_id);
  if (content === null) return null;
  if (content.source === 'youtube' && content.external_id !== null) {
    return `/library/watch/${content.external_id}`;
  }
  if (content.source === 'web' && content.url !== null) {
    return `/library/read?url=${encodeURIComponent(content.url)}`;
  }
  return content.url;
}

export interface SearchStore {
  get query(): string;
  set query(value: string);
  get results(): SearchHit[];
  get open(): boolean;
  run(): void;
  resolveHref(hit: SearchHit): Promise<string | null>;
  close(): void;
}

export function createSearchStore(): SearchStore {
  startReindexWatcher();

  let query = $state('');
  let results = $state<SearchHit[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let runId = 0;

  function run(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const q = query.trim();
    if (q === '') {
      runId += 1; // invalidate any in-flight search
      results = [];
      open = false;
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      const id = ++runId;
      void (async () => {
        const db = await getDb();
        const hits = await searchLocal(db, q, SEARCH_LIMIT);
        if (id !== runId) return;
        results = hits;
        open = true;
      })();
    }, SEARCH_DEBOUNCE_MS);
  }

  return {
    get query() {
      return query;
    },
    set query(value: string) {
      query = value;
    },
    get results() {
      return results;
    },
    get open() {
      return open;
    },
    run,
    resolveHref,
    close() {
      open = false;
    },
  };
}
