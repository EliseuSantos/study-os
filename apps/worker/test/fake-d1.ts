import type { Row, SqlValue } from '@studyos/db';
import { Database } from 'bun:sqlite';
import type { D1DatabaseLike, D1PreparedStatementLike } from '../src/env';

const MIGRATIONS_DIR = new URL('../../../packages/db/migrations/', import.meta.url)
  .pathname;

class FakePrepared implements D1PreparedStatementLike {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly params: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): FakePrepared {
    return new FakePrepared(this.db, this.sql, values);
  }

  async all(): Promise<{ results: Row[] }> {
    const results = this.db.query(this.sql).all(...this.params) as Row[];
    return { results };
  }

  async run(): Promise<unknown> {
    this.db.query(this.sql).run(...this.params);
    return { success: true };
  }

  async first(): Promise<Row | null> {
    const row = this.db.query(this.sql).get(...this.params) as Row | null;
    return row;
  }
}

export class FakeD1 implements D1DatabaseLike {
  private readonly db: Database;

  constructor(migrationSql: string) {
    this.db = new Database(':memory:');
    for (const raw of migrationSql.split(';')) {
      const stmt = raw.trim();
      if (stmt) this.db.run(stmt);
    }
  }

  prepare(sql: string): D1PreparedStatementLike {
    return new FakePrepared(this.db, sql);
  }

  async batch(stmts: D1PreparedStatementLike[]): Promise<unknown> {
    const results: unknown[] = [];
    this.db.run('BEGIN');
    try {
      for (const stmt of stmts) results.push(await stmt.run());
      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
    return results;
  }
}

export async function createFakeD1(): Promise<FakeD1> {
  const glob = new Bun.Glob('*.sql');
  const files = (await Array.fromAsync(glob.scan({ cwd: MIGRATIONS_DIR }))).sort();
  const parts = await Promise.all(files.map((f) => Bun.file(`${MIGRATIONS_DIR}${f}`).text()));
  return new FakeD1(parts.join('\n'));
}
