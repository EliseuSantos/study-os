import type { Database } from 'bun:sqlite';
import type { DbDriver, Row, Stmt } from '../driver';

export function bunSqliteDriver(db: Database): DbDriver {
  const runAll = db.transaction((stmts: Stmt[]) => {
    for (const s of stmts) db.prepare(s.sql).run(...(s.params ?? []));
  });
  return {
    exec(sql, params = []) {
      return Promise.resolve(db.prepare(sql).all(...params) as Row[]);
    },
    batch(stmts) {
      runAll(stmts);
      return Promise.resolve();
    },
  };
}
