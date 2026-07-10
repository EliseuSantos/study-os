import {
  SETTINGS_KEYS,
  SYNC_BATCH_SIZE,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from '@studyos/shared';
import type { DbDriver } from '../driver';
import { markSynced, unsentOps } from '../repo/oplog';
import { getOrCreateDeviceId, getSetting } from '../repo/settings';
import { applyPullPage } from './apply';

export interface Transport {
  push(req: PushRequest): Promise<PushResponse>;
  pull(since: number, deviceId: string): Promise<PullResponse>;
}

export async function syncNow(
  db: DbDriver,
  transport: Transport,
): Promise<{ pushed: number; pulled: number }> {
  const deviceId = await getOrCreateDeviceId(db);

  let pushed = 0;
  for (;;) {
    const batch = await unsentOps(db, SYNC_BATCH_SIZE);
    if (batch.length === 0) break;
    await transport.push({ device_id: deviceId, ops: batch.map((b) => b.entry) });
    await markSynced(
      db,
      batch.map((b) => b.seq),
    );
    pushed += batch.length;
    if (batch.length < SYNC_BATCH_SIZE) break;
  }

  let pulled = 0;
  for (;;) {
    const raw = await getSetting(db, SETTINGS_KEYS.syncCursor);
    const since = raw === null ? 0 : Number(raw);
    const page = await transport.pull(since, deviceId);
    await applyPullPage(db, page);
    pulled += page.ops.length;
    if (!page.has_more || page.ops.length === 0) break;
  }

  return { pushed, pulled };
}
