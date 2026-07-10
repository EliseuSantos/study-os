import { SETTINGS_KEYS, type OpLogEntry, type PullResponse } from '@studyos/shared';
import type { DbDriver, Stmt } from '../driver';
import { lwwUpsertStmt } from '../helpers';
import { setSettingStmt } from '../repo/settings';

// Remote ops go to entity tables only — never to the local oplog — so applied
// pulls are not pushed back (anti ping-pong, docs/SYNC.md).
function remoteStmts(ops: OpLogEntry[]): Stmt[] {
  return ops.map((op) => lwwUpsertStmt(op.tbl, JSON.parse(op.payload) as Record<string, unknown>));
}

export async function applyRemoteOps(db: DbDriver, ops: OpLogEntry[]): Promise<void> {
  if (ops.length === 0) return;
  await db.batch(remoteStmts(ops));
}

/** Applies a pull page and advances the sync cursor in one atomic batch. */
export async function applyPullPage(db: DbDriver, page: PullResponse): Promise<void> {
  await db.batch([
    ...remoteStmts(page.ops),
    setSettingStmt(SETTINGS_KEYS.syncCursor, String(page.cursor)),
  ]);
}
