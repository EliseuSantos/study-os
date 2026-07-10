import type { DbDriver, Row } from '../driver';

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all(): Promise<{ results: Record<string, unknown>[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  /** Natively atomic per Cloudflare D1 semantics. */
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>;
}

export function d1Driver(db: D1DatabaseLike): DbDriver {
  return {
    async exec(sql, params = []) {
      const { results } = await db
        .prepare(sql)
        .bind(...params)
        .all();
      return results as Row[];
    },
    async batch(stmts) {
      if (stmts.length === 0) return;
      await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...(s.params ?? []))));
    },
  };
}
