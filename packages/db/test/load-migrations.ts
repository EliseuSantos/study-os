import { Database } from 'bun:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bunSqliteDriver } from '../src/adapters/bun-sqlite';
import { migrate, type Migration } from '../src/migrate';
import type { DbDriver } from '../src/driver';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');

export async function loadMigrations(): Promise<Migration[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .toSorted();
  return Promise.all(
    files.map(async (f) => ({
      version: Number.parseInt(f, 10),
      sql: await Bun.file(join(MIGRATIONS_DIR, f)).text(),
    })),
  );
}

export async function freshDb(): Promise<DbDriver> {
  const driver = bunSqliteDriver(new Database(':memory:'));
  await migrate(driver, await loadMigrations());
  return driver;
}
