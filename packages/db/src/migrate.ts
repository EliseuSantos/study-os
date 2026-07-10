import type { DbDriver, Stmt } from './driver';

export interface Migration {
  version: number;
  sql: string;
}

/**
 * Applies pending migrations (version > PRAGMA user_version) in ascending order.
 * Migration SQL is split naively on ';' — no triggers or BEGIN blocks allowed.
 */
export async function migrate(driver: DbDriver, migrations: Migration[]): Promise<void> {
  const rows = await driver.exec('PRAGMA user_version');
  const current = Number(rows[0]?.['user_version'] ?? 0);
  const pending = migrations
    .filter((m) => m.version > current)
    .toSorted((a, b) => a.version - b.version);
  for (const m of pending) {
    if (!Number.isInteger(m.version) || m.version <= 0) {
      throw new Error(`invalid migration version: ${m.version}`);
    }
    const stmts: Stmt[] = m.sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((sql) => ({ sql }));
    // batch() must stay atomic and PRAGMAs cannot run inside it, so the version
    // bump runs after; a crash in between makes the next run fail loudly on
    // re-apply instead of silently corrupting (see packages/db/README.md).
    await driver.batch(stmts);
    await driver.exec(`PRAGMA user_version = ${m.version}`);
  }
}
