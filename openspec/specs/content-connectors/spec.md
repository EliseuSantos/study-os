# content-connectors

## Purpose

The library searches external sources and attaches results to topics. CORS-friendly
sources (Wikipedia, Stack Exchange) run client-side; key-holding or scraping sources
(YouTube, Firecrawl web) go through the Worker's bearer-auth'd proxy, cached via the
Cache API seam (`apps/worker/src/cache.ts`) and — for Firecrawl — budgeted against the
free plan in D1.

## Requirements

### Requirement: Connector interface

Every connector SHALL be fetch-injectable, return at most 10 `ContentResult`s and
degrade to `[]` on any failure (never throw into the UI). Registry order is stable:
wikipedia, stackexchange, youtube, web.

```ts
export interface Connector {
  source: string;
  kind: ContentKind;
  search(q: string, fetchFn: FetchLike): Promise<ContentResult[]>;
}
export interface ContentResult {
  source: string;
  external_id: string;
  url: string;
  title: string;
  kind: 'video' | 'article' | 'qa' | 'doc';
  description: string | null;
  meta: Record<string, unknown>;
}
```

#### Scenario: Upstream failure

- **WHEN** a source answers non-2xx, malformed JSON, or the fetch throws
- **THEN** that connector yields `[]` and the other sources still render

### Requirement: Proxy wire formats

The Worker SHALL expose these bearer-auth'd routes with exactly these shapes:

| Route                               | Response                                                                   | Cache | Notes                                                 |
| ----------------------------------- | -------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| `GET /proxy/youtube/search?q=`      | `{ items: { id, title, channel, thumbnail, duration: string \| null }[] }` | 6h    | 503 without `YOUTUBE_API_KEY`; `duration` always null |
| `GET /proxy/youtube/transcript?id=` | timedtext XML (`text/xml`)                                                 | 24h   | lang pt → en fallback; 404 when neither               |
| `GET /proxy/rss?url=`               | passthrough body + content-type                                            | 1h    | https only, private hosts blocked, 5s timeout         |
| `GET /proxy/firecrawl/search?q=`    | `{ items: { url, title, description: string \| null }[] }`                 | 6h    | 2 credits; 503 without key; 429 over budget           |
| `GET /proxy/firecrawl/scrape?url=`  | `{ url, title, markdown }`                                                 | 7d    | 1 credit; same URL rules as rss; 502 when unreadable  |

#### Scenario: Unconfigured source hides itself

- **WHEN** the key secret is absent and the proxy answers 503
- **THEN** the library shows 'busca do youtube não configurada.' / 'busca na web não
  configurada.' under that source group and no results

### Requirement: Firecrawl monthly budget

Firecrawl calls SHALL be charged against a monthly counter in D1 `proxy_usage`
(`service, period 'YYYY-MM', credits`) with a guarded atomic increment that fails
closed at `FIRECRAWL_MONTHLY_CREDITS` (default 1000 — the free plan). Cache hits SHALL
never charge. Past the ceiling the proxy answers
`429 { "error": "firecrawl monthly limit reached" }` without calling the API.

#### Scenario: Cache hit is free

- **WHEN** the same query/URL is requested again inside the TTL
- **THEN** no upstream fetch happens and `proxy_usage.credits` is unchanged

#### Scenario: Ceiling reached

- **WHEN** a request would push the month's credits past the ceiling
- **THEN** the API is not called, 429 is returned, and the UI shows
  'limite mensal de busca atingido — renova no próximo mês.' (`web-over-budget`)

### Requirement: Library UI and routing

Testids are the e2e contract: `library-search-form/input/submit`,
`library-filter-{all|youtube|wikipedia|stackexchange|web}`, `library-results`,
`library-result`, `library-attach`, `attach-picker`, `attach-track-select`,
`attach-topic-select`, `attach-confirm`, `web-over-budget`; watch page `video-player`,
`transcript-panel`, `transcript-cue`, `transcript-follow`; reader `article-reader`,
`article-title`, `article-body`; topic panel `topic-content-list/item/remove`.
Routing SHALL be: youtube → `/library/watch/<external_id>`; web →
`/library/read?url=<encoded>`; other sources open the original URL (noopener).

#### Scenario: Attach and revisit

- **WHEN** a web result is attached to a topic and clicked from the topic panel
- **THEN** it opens in the in-app reader with the scraped markdown rendered

## Notes

Coverage: `apps/worker/test/{proxy,firecrawl}.test.ts`,
`packages/connectors/test/*.test.ts`, `cypress/e2e/{library-loop,web-content-loop}.cy.ts`.
