import * as SQLite from '@journeyapps/wa-sqlite';
import SQLiteESMFactory from '@journeyapps/wa-sqlite/dist/wa-sqlite.mjs';
import wasmUrl from '@journeyapps/wa-sqlite/dist/wa-sqlite.wasm?url';
import { OPFSCoopSyncVFS } from '@journeyapps/wa-sqlite/src/examples/OPFSCoopSyncVFS.js';
import initSql from '@studyos/db/migrations/0001_init.sql?raw';
import proxyUsageSql from '@studyos/db/migrations/0002_proxy_usage.sql?raw';
import annotationsSql from '@studyos/db/migrations/0003_annotations.sql?raw';
import goalsTrackSql from '@studyos/db/migrations/0004_goals_track.sql?raw';
import questionAttemptsSql from '@studyos/db/migrations/0005_question_attempts.sql?raw';
import topicsOriginKeySql from '@studyos/db/migrations/0006_topics_origin_key.sql?raw';
import classesSql from '@studyos/db/migrations/0007_classes.sql?raw';
import { migrate, type Row, type SqlValue, type Stmt } from '@studyos/db';
import { DB_CHANNEL, DB_NAME } from '@studyos/shared';
import type { DbBroadcast, DbReady, DbRequest, DbResponse } from './rpc';

let sqlite3: SQLiteAPI;
let db: number;

const channel = new BroadcastChannel(DB_CHANNEL);

function toSqlValue(value: SQLiteCompatibleType | null): SqlValue {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'bigint') return Number(value);
  return Uint8Array.from(value);
}

async function exec(sql: string, params?: SqlValue[]): Promise<Row[]> {
  const rows: Row[] = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params !== undefined && params.length > 0) {
      sqlite3.bind_collection(stmt, params);
    }
    const columns = sqlite3.column_names(stmt);
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      const values = sqlite3.row(stmt);
      const row: Row = {};
      for (const [i, name] of columns.entries()) {
        row[name] = toSqlValue(values[i] ?? null);
      }
      rows.push(row);
    }
  }
  return rows;
}

async function runBatch(stmts: Stmt[]): Promise<void> {
  await exec('BEGIN IMMEDIATE');
  try {
    for (const stmt of stmts) {
      await exec(stmt.sql, stmt.params);
    }
    await exec('COMMIT');
  } catch (error) {
    try {
      await exec('ROLLBACK');
    } catch {
      /* rollback failure is superseded by the original error */
    }
    throw error;
  }
}

function isBusy(error: unknown): boolean {
  return error instanceof SQLite.SQLiteError && error.code === SQLite.SQLITE_BUSY;
}

async function batch(stmts: Stmt[]): Promise<void> {
  try {
    await runBatch(stmts);
  } catch (error) {
    if (!isBusy(error)) throw error;
    await runBatch(stmts);
  }
}

async function init(): Promise<void> {
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  sqlite3 = SQLite.Factory(module);
  const vfs = await OPFSCoopSyncVFS.create('studyos', module);
  sqlite3.vfs_register(vfs, true);
  db = await sqlite3.open_v2(DB_NAME);
  await migrate({ exec, batch: runBatch }, [
    { version: 1, sql: initSql },
    { version: 2, sql: proxyUsageSql },
    { version: 3, sql: annotationsSql },
    { version: 4, sql: goalsTrackSql },
    { version: 5, sql: questionAttemptsSql },
    { version: 6, sql: topicsOriginKeySql },
    { version: 7, sql: classesSql },
  ]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const ready = init();
ready.then(
  () => self.postMessage({ kind: 'ready' } satisfies DbReady),
  (error: unknown) =>
    self.postMessage({ kind: 'init-error', error: errorMessage(error) } satisfies DbReady),
);

self.onmessage = async (event: MessageEvent<DbRequest>) => {
  const request = event.data;
  try {
    await ready;
    if (request.kind === 'exec') {
      const rows = await exec(request.sql, request.params);
      self.postMessage({ id: request.id, ok: true, rows } satisfies DbResponse);
    } else {
      await batch(request.stmts);
      if (request.mutates.length > 0) {
        channel.postMessage({
          kind: 'tables-changed',
          tables: request.mutates,
        } satisfies DbBroadcast);
      }
      self.postMessage({ id: request.id, ok: true, rows: [] } satisfies DbResponse);
    }
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: errorMessage(error),
    } satisfies DbResponse);
  }
};
