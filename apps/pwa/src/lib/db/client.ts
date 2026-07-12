import { browser } from '$app/environment';
import {
  ensureSearchIndex,
  reindexAll,
  type DbDriver,
  type Row,
  type SqlValue,
  type Stmt,
} from '@studyos/db';
import { markDbReady, markDbUnavailable } from '$lib/stores/db-state.svelte';
import type { DbReady, DbRequest, DbResponse } from './rpc';

let instance: Promise<DbDriver> | null = null;

// A dev-server module reload can kill the worker mid-boot; retries with
// backoff recover, while a real failure (no OPFS) keeps failing the same way.
async function createDriverWithRetry(): Promise<DbDriver> {
  const delays = [600, 1500, 3000];
  for (const delay of delays) {
    try {
      return await createDriver();
    } catch (error) {
      if (typeof navigator !== 'undefined' && !window.isSecureContext) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return createDriver();
}

export function getDb(): Promise<DbDriver> {
  if (!browser) return Promise.reject(new Error('getDb is browser-only'));
  instance ??= createDriverWithRetry().then(
    (driver) => {
      markDbReady();
      return driver;
    },
    (error: unknown) => {
      markDbUnavailable();
      throw error;
    },
  );
  return instance;
}

export async function requestPersistence(): Promise<boolean> {
  if (!browser || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

const MUTATION_RE =
  /^\s*(?:insert\s+(?:or\s+\w+\s+)?into|replace\s+into|update(?:\s+or\s+\w+)?|delete\s+from)\s+["'`[]?(\w+)/i;

function mutatedTables(stmts: Stmt[]): string[] {
  const tables = new Set<string>();
  for (const stmt of stmts) {
    const match = MUTATION_RE.exec(stmt.sql);
    if (match?.[1]) tables.add(match[1]);
  }
  return [...tables];
}

async function createDriver(): Promise<DbDriver> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<
    number,
    { resolve: (rows: Row[]) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;

  try {
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<DbReady>) => {
        if (event.data.kind === 'ready') resolve();
        else reject(new Error(event.data.error));
      };
      worker.onerror = (event) => reject(new Error(event.message || 'db worker failed to start'));
    });
  } catch (error) {
    // A half-booted worker still holds OPFS locks — kill it before any retry
    // spawns a second VFS over the same files.
    worker.terminate();
    throw error;
  }

  worker.onerror = null;
  worker.onmessage = (event: MessageEvent<DbResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.rows);
    else entry.reject(new Error(response.error));
  };

  function send(request: DbRequest): Promise<Row[]> {
    return new Promise<Row[]>((resolve, reject) => {
      pending.set(request.id, { resolve, reject });
      worker.postMessage(request);
    });
  }

  const driver: DbDriver = {
    exec(sql: string, params?: SqlValue[]): Promise<Row[]> {
      const id = nextId++;
      return send(
        params === undefined ? { id, kind: 'exec', sql } : { id, kind: 'exec', sql, params },
      );
    },
    async batch(stmts: Stmt[]): Promise<void> {
      const id = nextId++;
      await send({ id, kind: 'batch', stmts, mutates: mutatedTables(stmts) });
    },
  };

  // Local-only FTS index (see packages/db/src/search.ts): create after migrate,
  // then rebuild in the background so global search reflects the current data.
  await ensureSearchIndex(driver);
  void reindexAll(driver);
  return driver;
}
