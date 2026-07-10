# Content connectors & proxies

status: implemented
owner: Eliseu

## Context

The library searches external sources and attaches results to topics. Sources with CORS
(Wikipedia, Stack Exchange) run client-side; sources needing keys or scraping (YouTube,
Firecrawl web) go through the Worker's bearer-auth'd proxy, cached via the Cache API and
— for Firecrawl — budgeted against the free plan in D1.

## Requirements

1. Every connector is fetch-injectable, returns ≤ 10 results, and degrades to `[]` on
   any failure (never throws into the UI).
2. Proxy sources hide themselves when unconfigured (worker answers 503) and show calm
   notes when over budget (429).
3. Cache hits must never consume external-API credits.

## Contracts

### Connector interface (`packages/connectors`)

```ts
export type ContentKind = 'video' | 'article' | 'qa' | 'doc';
export interface ContentResult {
  source: string;
  external_id: string;
  url: string;
  title: string;
  kind: ContentKind;
  description: string | null;
  meta: Record<string, unknown>;
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface Connector {
  source: string;
  kind: ContentKind;
  search(q: string, fetchFn: FetchLike): Promise<ContentResult[]>;
}
// registry order: wikipedia, stackexchange, youtube, web
```

### Proxy wire formats (`apps/worker`)

| Route (bearer)                      | Response                                                                   | Cache | Notes                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------- |
| `GET /proxy/youtube/search?q=`      | `{ items: { id, title, channel, thumbnail, duration: string \| null }[] }` | 6h    | 503 without `YOUTUBE_API_KEY`; `duration` always null (search endpoint lacks it) |
| `GET /proxy/youtube/transcript?id=` | timedtext XML (`text/xml`)                                                 | 24h   | lang pt → en fallback; 404 when neither                                          |
| `GET /proxy/rss?url=`               | passthrough body + content-type                                            | 1h    | https only, private hosts blocked, 5s timeout                                    |
| `GET /proxy/firecrawl/search?q=`    | `{ items: { url, title, description: string \| null }[] }`                 | 6h    | 2 credits; 503 without `FIRECRAWL_API_KEY`; 429 over monthly budget              |
| `GET /proxy/firecrawl/scrape?url=`  | `{ url, title, markdown }`                                                 | 7d    | 1 credit; same URL rules as rss; 502 when unreadable                             |

Firecrawl budget: `proxy_usage` D1 table (`service, period 'YYYY-MM', credits`), guarded
atomic increment, fails closed at `FIRECRAWL_MONTHLY_CREDITS` (default 1000, free plan).
Cache hit → no charge.

### UI testids

```
library: library-search-form, library-search-input, library-search-submit,
  library-filter-{all|youtube|wikipedia|stackexchange|web}, library-results,
  library-result, library-attach, attach-picker, attach-track-select,
  attach-topic-select, attach-confirm, web-over-budget
watch:   video-player, transcript-panel, transcript-cue, transcript-follow
reader:  article-reader, article-title, article-body
topic:   topic-content-list, topic-content-item, topic-content-remove
```

Copy: 'busca do youtube não configurada.' · 'busca na web não configurada.' ·
'limite mensal de busca atingido — renova no próximo mês.' ·
'limite mensal de leitura atingido — renova no próximo mês.'

Routing: youtube content → `/library/watch/<external_id>`; web content →
`/library/read?url=<encoded>`; everything else opens the original URL (noopener).

## Acceptance criteria

1. Search with stubbed sources shows grouped results and attaches to a topic —
   `library-loop.cy.ts`, `web-content-loop.cy.ts`.
2. Attached video plays with transcript cues; attached article renders in the reader —
   same specs.
3. Over-budget search shows the calm note — `web-content-loop.cy.ts`.
4. Cache hit skips fetch and charges nothing; 429 exactly at the ceiling —
   `apps/worker/test/{proxy,firecrawl}.test.ts`.

## Verification

`bun x turbo typecheck lint test build` green; Cypress suite green against
`vite preview` (Chromium).
