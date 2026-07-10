import type { DbDriver, Row, SqlValue, Stmt } from '@studyos/db';
import type { D1DatabaseLike } from './env';

export function d1Driver(db: D1DatabaseLike): DbDriver {
  return {
    async exec(sql: string, params: SqlValue[] = []): Promise<Row[]> {
      const { results } = await db
        .prepare(sql)
        .bind(...params)
        .all();
      return results;
    },
    async batch(stmts: Stmt[]): Promise<void> {
      if (stmts.length === 0) return;
      await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...(s.params ?? []))));
    },
  };
}
