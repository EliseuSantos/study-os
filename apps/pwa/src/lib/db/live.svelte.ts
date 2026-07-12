import { browser } from '$app/environment';
import type { DbDriver } from '@studyos/db';
import { DB_CHANNEL } from '@studyos/shared';
import { getDb } from './client';
import type { DbBroadcast } from './rpc';

export interface LiveQuery<T> {
  get value(): T;
  refresh(): Promise<void>;
  destroy(): void;
}

export function liveQuery<T>(
  fn: (db: DbDriver) => Promise<T>,
  deps: string[],
  initial: T,
): LiveQuery<T> {
  let value = $state(initial);
  let channel: BroadcastChannel | null = null;

  async function refresh(): Promise<void> {
    if (!browser) return;
    try {
      const db = await getDb();
      value = await fn(db);
    } catch (error) {
      // db unavailable (e.g. OPFS blocked on insecure origins) — the shell
      // banner explains it; queries keep their initial value
      if (import.meta.env.DEV) console.error('[liveQuery]', error);
    }
  }

  if (browser) {
    channel = new BroadcastChannel(DB_CHANNEL);
    channel.onmessage = (event: MessageEvent<DbBroadcast>) => {
      const message = event.data;
      if (message.kind === 'tables-changed' && message.tables.some((t) => deps.includes(t))) {
        void refresh();
      }
    };
    void refresh();
  }

  return {
    get value() {
      return value;
    },
    refresh,
    destroy() {
      channel?.close();
      channel = null;
    },
  };
}
