import { browser, dev } from '$app/environment';
import { SYNCED_TABLES, getOrCreateDeviceId, getSetting, syncNow, type Transport } from '@studyos/db';
import {
  DB_CHANNEL,
  SETTINGS_KEYS,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from '@studyos/shared';
import { buildClassProgressSummary } from '@studyos/db';
import { getDb } from '$lib/db/client';
import type { DbBroadcast } from '$lib/db/rpc';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled';

const DEBOUNCE_MS = 3000;
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;

export const syncState = $state({
  status: 'idle' as SyncStatus,
  lastSyncAt: null as number | null,
});

let inFlight: Promise<void> | null = null;
let queued = false;
let failures = 0;
let nextAllowedAt = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function getToken(): Promise<string | null> {
  const db = await getDb();
  const stored = await getSetting(db, SETTINGS_KEYS.syncToken);
  if (stored) return stored;
  return dev ? 'dev-token' : null;
}

function makeTransport(token: string): Transport {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  return {
    async push(req: PushRequest): Promise<PushResponse> {
      const res = await fetch('/sync/push', {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`push failed: ${res.status}`);
      return (await res.json()) as PushResponse;
    },
    async pull(since: number, deviceId: string): Promise<PullResponse> {
      const params = new URLSearchParams({ since: String(since), device: deviceId });
      const res = await fetch(`/sync/pull?${params}`, { headers });
      if (!res.ok) throw new Error(`pull failed: ${res.status}`);
      return (await res.json()) as PullResponse;
    },
  };
}

async function runSync(): Promise<void> {
  if (!browser || !navigator.onLine) {
    syncState.status = 'offline';
    return;
  }
  const token = await getToken();
  if (!token) {
    syncState.status = 'disabled';
    return;
  }
  syncState.status = 'syncing';
  try {
    const db = await getDb();
    await syncNow(db, makeTransport(token));
    failures = 0;
    nextAllowedAt = 0;
    syncState.status = 'idle';
    syncState.lastSyncAt = Date.now();
    void postClassProgress(token); // opt-in, anonymous, never blocks the sync
  } catch (error) {
    failures += 1;
    nextAllowedAt = Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
    syncState.status = 'error';
    if (import.meta.env.DEV) console.error('[sync] fail', error);
    throw error;
  }
}

/**
 * Opt-in anonymous cohort progress: when this device joined a class AND the
 * student turned sharing on, POST the aggregate summary (salted anon id —
 * never the device id) after each successful sync. Best-effort.
 */
async function postClassProgress(_token: string): Promise<void> {
  try {
    const db = await getDb();
    const [optin, joined] = await Promise.all([
      getSetting(db, 'progress_optin'),
      getSetting(db, 'joined_class'),
    ]);
    if (optin !== '1' || joined === null) return;
    const shareId = joined.split(':')[0] ?? '';
    if (shareId === '') return;
    const summary = await buildClassProgressSummary(db, shareId);
    if (summary === null) return;
    const deviceId = await getOrCreateDeviceId(db);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`studyos:${deviceId}:${shareId}`),
    );
    const anonId = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await fetch(`/class/${shareId}/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ anon_id: anonId, payload: summary }),
    });
  } catch {
    // anonymous progress is best-effort by design
  }
}

/** Manual trigger: ignores backoff, coalesces with an in-flight run. */
export function requestSync(): Promise<void> {
  if (inFlight) {
    queued = true;
    return inFlight;
  }
  inFlight = runSync()
    .catch(() => {
      /* state captured in syncState; sync errors are non-fatal */
    })
    .finally(() => {
      inFlight = null;
      if (queued) {
        queued = false;
        void requestSync();
      }
    });
  return inFlight;
}

function requestAutoSync(): void {
  if (Date.now() < nextAllowedAt) return;
  void requestSync();
}

async function hasUnsentOps(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.exec('SELECT 1 FROM oplog WHERE synced = 0 LIMIT 1');
  return rows.length > 0;
}

/** Debounced push trigger for local writes; skips when the change came from a pull. */
function onTablesChanged(tables: string[]): void {
  if (!tables.some((t) => Object.hasOwn(SYNCED_TABLES, t))) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void hasUnsentOps().then((pending) => {
      if (pending) requestAutoSync();
    });
  }, DEBOUNCE_MS);
}

export function startSyncLifecycle(): () => void {
  if (!browser) return () => {};

  const channel = new BroadcastChannel(DB_CHANNEL);
  channel.onmessage = (event: MessageEvent<DbBroadcast>) => {
    if (event.data.kind === 'tables-changed') onTablesChanged(event.data.tables);
  };
  const onOnline = () => requestAutoSync();
  window.addEventListener('online', onOnline);

  requestAutoSync();

  return () => {
    channel.close();
    window.removeEventListener('online', onOnline);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}
