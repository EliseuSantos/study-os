import { SYNC_BATCH_SIZE, type OpLogEntry, type PullResponse } from '@studyos/shared';
import type { Row, Stmt } from '../driver';
import { lwwUpsertStmt } from '../helpers';
import { isSyncedTable } from '../tables';

export function buildPushStmts(ops: OpLogEntry[]): Stmt[] {
  const stmts: Stmt[] = [];
  for (const op of ops) {
    if (!isSyncedTable(op.tbl)) throw new Error(`unknown synced table: ${op.tbl}`);
    const row = JSON.parse(op.payload) as Record<string, unknown>;
    if (row['id'] !== op.row_id) throw new Error(`payload id mismatch for ${op.tbl}/${op.row_id}`);
    stmts.push(lwwUpsertStmt(op.tbl, row));
    stmts.push({
      sql:
        'INSERT INTO server_oplog (tbl,row_id,op,payload,updated_at,device_id) VALUES (?,?,?,?,?,?) ' +
        'ON CONFLICT(tbl,row_id) DO UPDATE SET op=excluded.op,payload=excluded.payload,' +
        'updated_at=excluded.updated_at,device_id=excluded.device_id ' +
        'WHERE excluded.updated_at > server_oplog.updated_at',
      params: [op.tbl, op.row_id, op.op, op.payload, op.updated_at, op.device_id],
    });
  }
  return stmts;
}

export function buildPullStmt(since: number, deviceId: string, limit = SYNC_BATCH_SIZE): Stmt {
  return {
    sql:
      'SELECT tbl,row_id,op,payload,updated_at,device_id FROM server_oplog ' +
      'WHERE updated_at >= ? AND device_id != ? ORDER BY updated_at, row_id LIMIT ?',
    params: [since, deviceId, limit],
  };
}

export function rowsToPull(rows: Row[], since: number, limit = SYNC_BATCH_SIZE): PullResponse {
  const ops = rows.map(
    (r): OpLogEntry => ({
      tbl: r['tbl'] as string,
      row_id: r['row_id'] as string,
      op: r['op'] as OpLogEntry['op'],
      payload: r['payload'] as string,
      updated_at: r['updated_at'] as number,
      device_id: r['device_id'] as string,
    }),
  );
  let cursor = since;
  for (const op of ops) if (op.updated_at > cursor) cursor = op.updated_at;
  return { ops, cursor, has_more: ops.length === limit };
}
