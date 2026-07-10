import type { SqlValue } from '@studyos/db';

export interface D1PreparedStatementLike {
  bind(...values: SqlValue[]): D1PreparedStatementLike;
  all(): Promise<{ results: Record<string, SqlValue>[] }>;
  run(): Promise<unknown>;
  first(): Promise<Record<string, SqlValue> | null>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(stmts: D1PreparedStatementLike[]): Promise<unknown>;
}

export interface FetcherLike {
  fetch(request: Request): Promise<Response>;
}

/** Structural view of an R2 object body — only what /share needs. */
export interface R2ObjectLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Structural view of an R2 bucket binding (no @cloudflare/workers-types here). */
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
}

export interface Env {
  DB: D1DatabaseLike;
  SYNC_TOKEN: string;
  ASSETS: FetcherLike;
  /** R2 bucket holding gzipped track snapshots (`shares/<id>.json.gz`). */
  SHARES: R2BucketLike;
  /** Raw uncompressed P-256 point, base64url (see README "Web push"). */
  VAPID_PUBLIC_KEY: string;
  /** EC P-256 private key as a JWK JSON string (see README "Web push"). */
  VAPID_PRIVATE_KEY: string;
  /** mailto: or https: contact, RFC 8292 `sub` claim. */
  VAPID_SUBJECT: string;
  /** YouTube Data API v3 key; optional — /proxy/youtube/search answers 503 without it. */
  YOUTUBE_API_KEY?: string;
  /** Firecrawl API key; optional — /proxy/firecrawl/* answers 503 without it. */
  FIRECRAWL_API_KEY?: string;
  /** Monthly credit ceiling for the Firecrawl free plan; defaults to 1000. */
  FIRECRAWL_MONTHLY_CREDITS?: string;
}
