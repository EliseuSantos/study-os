import type { SqlValue, Stmt } from './driver';
import { SYNCED_TABLES, isSyncedTable } from './tables';

export function lwwUpsertStmt(tbl: string, row: Record<string, unknown>): Stmt {
  if (!isSyncedTable(tbl)) throw new Error(`unknown synced table: ${tbl}`);
  const cols = SYNCED_TABLES[tbl].columns;
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c}=excluded.${c}`)
    .join(',');
  return {
    sql:
      `INSERT INTO ${tbl} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ` +
      `ON CONFLICT(id) DO UPDATE SET ${updates} ` +
      `WHERE excluded.updated_at > ${tbl}.updated_at`,
    params: cols.map((c) => toSqlValue(row[c])),
  };
}

function toSqlValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Uint8Array) return v;
  throw new Error(`unsupported sql value: ${typeof v}`);
}
