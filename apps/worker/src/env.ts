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

export interface Env {
  DB: D1DatabaseLike;
  SYNC_TOKEN: string;
  ASSETS: FetcherLike;
}
