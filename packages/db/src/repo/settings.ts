import { SETTINGS_KEYS, newId, now } from '@studyos/shared';
import type { DbDriver, Stmt } from '../driver';

// settings is LOCAL-ONLY: writes here never touch the oplog.

export function setSettingStmt(key: string, value: string): Stmt {
  return {
    sql: 'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    params: [key, value, now()],
  };
}

export async function getSetting(db: DbDriver, key: string): Promise<string | null> {
  const rows = await db.exec('SELECT value FROM settings WHERE key = ?', [key]);
  const value = rows[0]?.['value'];
  return typeof value === 'string' ? value : null;
}

export async function setSetting(db: DbDriver, key: string, value: string): Promise<void> {
  const stmt = setSettingStmt(key, value);
  await db.exec(stmt.sql, stmt.params);
}

export async function getOrCreateDeviceId(db: DbDriver): Promise<string> {
  const existing = await getSetting(db, SETTINGS_KEYS.deviceId);
  if (existing !== null) return existing;
  const id = newId();
  await setSetting(db, SETTINGS_KEYS.deviceId, id);
  return id;
}
