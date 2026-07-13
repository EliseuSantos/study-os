import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { bunSqliteDriver } from '../src/adapters/bun-sqlite';
import { migrate } from '../src/migrate';
import { loadMigrations } from './load-migrations';

const EXPECTED_TABLES = [
  'goals',
  'tracks',
  'topics',
  'topic_deps',
  'cycle_slots',
  'lessons',
  'content_items',
  'lesson_items',
  'cards',
  'fsrs_state',
  'review_logs',
  'routines',
  'sessions',
  'checklist_items',
  'targets',
  'reminders',
  'settings',
  'oplog',
  'server_oplog',
  'push_subscriptions',
  'track_shares',
  'proxy_usage',
  'annotations',
  'question_attempts',
  'classes',
  'class_progress',
];

test('schema applies cleanly and sets user_version to the latest migration', async () => {
  const db = bunSqliteDriver(new Database(':memory:'));
  const migrations = await loadMigrations();
  const latest = Math.max(...migrations.map((m) => m.version));
  await migrate(db, migrations);

  const [row] = await db.exec('PRAGMA user_version');
  expect(row?.['user_version']).toBe(latest);

  const rows = await db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const names = rows.map((r) => r['name']);
  for (const t of EXPECTED_TABLES) expect(names).toContain(t);
  expect(names.length).toBe(EXPECTED_TABLES.length);
});

test('re-running migrate is a no-op', async () => {
  const db = bunSqliteDriver(new Database(':memory:'));
  const migrations = await loadMigrations();
  const latest = Math.max(...migrations.map((m) => m.version));
  await migrate(db, migrations);
  await migrate(db, migrations);

  const [row] = await db.exec('PRAGMA user_version');
  expect(row?.['user_version']).toBe(latest);
});
