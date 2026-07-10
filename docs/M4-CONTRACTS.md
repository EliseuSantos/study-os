# M4 contracts (frozen for parallel workstreams)

Content: `Connector` interface + Wikipedia/Stack Exchange (client-side) + YouTube via
Worker proxy, Library screen with unified search, attach content to topics, video player
with transcript, local FTS5 search. Done when: search a subject → attach a video to a
topic → open it with transcript from the topic.

## packages/connectors (stream A)

```ts
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
export const connectors: Connector[]; // registry, stable order: wikipedia, stackexchange, youtube
export function getConnector(source: string): Connector | null;
```

- **wikipedia**: `https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=` →
  kind 'article', url `https://pt.wikipedia.org/wiki/<title>`, external_id = pageid.
- **stackexchange**: `https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&order=desc&sort=relevance&q=` →
  kind 'qa', title html-entity-decoded, meta { score, answer_count, is_answered }.
- **youtube**: calls the app-relative proxy `/proxy/youtube/search?q=` (Worker adds the API
  key). Response wire format (frozen, worker implements):
  `{ items: { id, title, channel, thumbnail, duration: string | null }[] }` →
  kind 'video', url `https://www.youtube.com/watch?v=<id>`, external_id = id.
- All connectors: inject `fetchFn`, no globals; non-2xx → return `[]` (never throw);
  unit-tested in bun with stubbed fetch + recorded-shape fixtures.

### Transcript (youtube only)

```ts
export interface TranscriptCue {
  start: number;
  dur: number;
  text: string;
}
export function parseTimedText(xml: string): TranscriptCue[]; // youtube timedtext XML -> cues
```

## apps/worker proxy (stream B)

- `GET /proxy/youtube/search?q=` (bearer): YouTube Data API v3 `search?part=snippet&type=video&maxResults=10&key=env.YOUTUBE_API_KEY`,
  mapped to the frozen wire format above. 503 `{ error: 'youtube api not configured' }`
  when the secret is missing. Cache API: `caches.default` keyed by normalized query, TTL
  6h (Cache-Control on the synthetic response).
- `GET /proxy/youtube/transcript?id=` (bearer): fetch
  `https://www.youtube.com/api/timedtext?v=<id>&lang=pt` then fallback `&lang=en`; return
  the raw XML as `text/xml` (client parses with `parseTimedText`); 404 when neither
  exists. Cached 24h via Cache API.
- `GET /proxy/rss?url=` (bearer): fetch the url (https only, block private IPs/localhost),
  return body with original content-type, cached 1h.
- Secrets: `YOUTUBE_API_KEY` (optional). Update env.ts, .dev.vars.example, README.
- Tests: bun + app.request with stubbed `globalThis.fetch` and a FakeCache injected —
  Cache API isn't in bun: wrap cache access in a small `getCache()` seam module that
  returns `caches.default` in workerd and an injectable stub in tests.

## packages/db (stream B)

```ts
// repo/content.ts
attachContent(db, deviceId, { topic_id, source, external_id?, url?, title, kind, meta_json? }): Promise<ContentItemRow>
listContentByTopic(db, topicId): Promise<ContentItemRow[]>
deleteContent(db, deviceId, id): Promise<void>

// search.ts (local-only FTS5 — NOT in shared migrations: D1 lacks FTS5)
ensureSearchIndex(db): Promise<void>  // CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, kind UNINDEXED, ref_id UNINDEXED)
reindexAll(db): Promise<void>         // rebuild from topics (title+notes_md), cards (front/back), content_items (title)
searchLocal(db, q, limit?): Promise<{ kind: 'topic' | 'card' | 'content'; ref_id: string; title: string; snippet: string }[]>
// maintenance: repos do NOT write fts on every write in M4; the PWA calls reindexAll
// on app open + after imports/attach (cheap at this scale); document as M6 candidate.
// searchLocal uses fts5 MATCH with prefix (`q*`), bm25 order, snippet().
```

PWA db worker calls `ensureSearchIndex` after migrate (stream D wires it).

## UI (streams C and D)

Stream C owns `/library/**` + `lib/stores/library*.svelte.ts`. Stream D owns the topic
content list inside `/tracks/[id]/` (new colocated component TopicContent.svelte mounted
by ONE line in the cards panel area), global search in the header (+layout.svelte —
max 15-line diff), and the FTS wiring in `lib/db/worker.ts` (one call) +
`lib/stores/search*.svelte.ts`.

### /library (C)

- `library-search-form`, `library-search-input`, `library-search-submit`
- Source filter chips `library-filter-all|youtube|wikipedia|stackexchange` (aria-pressed)
- Results `library-results`, `library-result` (title, source · kind badge, description),
  per result `library-attach` (opens topic picker: `attach-picker`, `attach-track-select`,
  `attach-topic-select`, `attach-confirm`) → attachContent
- Player: `/library/watch/[videoId]` — youtube-nocookie iframe embed (`video-player`),
  transcript panel `transcript-panel` with `transcript-cue` rows (time + text); fetch
  `/proxy/youtube/transcript?id=` (bearer token same as sync), parse with parseTimedText;
  clicking a cue seeks via the YouTube iframe postMessage API (`seekTo`); transcript
  missing → calm 'sem transcrição disponível.' `transcript-follow` toggle (auto-scroll).
- Search runs all enabled connectors in parallel (Promise.allSettled), tagged sections or
  merged list grouped by source; empty: 'nada encontrado — tente outros termos.'

### Topic content + global search (D)

- TopicContent.svelte: `topic-content-list`, `topic-content-item` (title, source badge,
  link — youtube items link to `/library/watch/<external_id>`, others open url in new tab
  rel=noopener), `topic-content-remove`. Mounted below CardsPanel for the selected topic.
- Header global search: `global-search-input` (compact, right side of nav) with dropdown
  `global-search-results` / `global-search-result` (kind badge + title; topic/card results
  navigate to their track page, content to its link). Debounced 200ms over searchLocal.
  Esc closes; keyboard navigable (arrow keys optional — at minimum tab-reachable).
- Wire `ensureSearchIndex` + `reindexAll` on db ready (in lib/db/client.ts getDb flow or
  layout onMount — keep it one call site), and refresh index after outline import/attach
  via reindexAll debounced on tables-changed ['topics','cards','content_items'].

Copy pt-BR sentence case; badges text-only (`vídeo · youtube`); no icons/emoji; tokens only.
Token for auth'd proxy/transcript calls: reuse the sync token pattern (see lib/push/subscribe.ts getToken usage).
