import { SYNC_BATCH_SIZE, type OpLogEntry } from '@studyos/shared';
import type { DbDriver, Stmt } from '../driver';
import { lwwUpsertStmt } from '../helpers';
import type { SyncedTable } from '../tables';

export interface UnsentOp {
  seq: number;
  entry: OpLogEntry;
}

export async function unsentOps(db: DbDriver, limit = SYNC_BATCH_SIZE): Promise<UnsentOp[]> {
  const rows = await db.exec(
    'SELECT seq, tbl, row_id, op, payload, updated_at, device_id FROM oplog ' +
      'WHERE synced = 0 ORDER BY seq LIMIT ?',
    [limit],
  );
  return rows.map((r) => ({
    seq: r['seq'] as number,
    entry: {
      tbl: r['tbl'] as string,
      row_id: r['row_id'] as string,
      op: r['op'] as OpLogEntry['op'],
      payload: r['payload'] as string,
      updated_at: r['updated_at'] as number,
      device_id: r['device_id'] as string,
    },
  }));
}

export async function markSynced(db: DbDriver, seqs: number[]): Promise<void> {
  if (seqs.length === 0) return;
  await db.exec(
    `UPDATE oplog SET synced = 1 WHERE seq IN (${seqs.map(() => '?').join(',')})`,
    seqs,
  );
}

/**
 * Statements for a synced-table write: entity upsert + oplog append. Exposed so
 * repos can compose extra statements into the same atomic batch (e.g. the
 * local-only review_logs insert in recordReview).
 */
export function localWriteStmts(
  tbl: SyncedTable,
  row: Record<string, unknown>,
  deviceId: string,
): Stmt[] {
  const rowId = row['id'];
  if (typeof rowId !== 'string') throw new Error(`localWrite ${tbl}: row.id must be a string`);
  const updatedAt = row['updated_at'];
  if (typeof updatedAt !== 'number') {
    throw new Error(`localWrite ${tbl}: row.updated_at must be a number`);
  }
  return [
    lwwUpsertStmt(tbl, row),
    {
      sql:
        'INSERT INTO oplog (tbl, row_id, op, payload, updated_at, device_id, synced) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 0)',
      params: [tbl, rowId, 'upsert', JSON.stringify(row), updatedAt, deviceId],
    },
  ];
}

/**
 * The single write path for synced tables: entity upsert + oplog append in one
 * atomic batch (invariant: an entity write is never visible without its op).
 */
export async function localWrite(
  db: DbDriver,
  tbl: SyncedTable,
  row: Record<string, unknown>,
  deviceId: string,
): Promise<void> {
  await db.batch(localWriteStmts(tbl, row, deviceId));
}
