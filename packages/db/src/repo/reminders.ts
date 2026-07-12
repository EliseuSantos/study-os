import { newId, now, type ReminderRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateReminderInput {
  title: string;
  notify_at: number;
  rrule?: string | null;
  ref_kind?: string | null;
  ref_id?: string | null;
}

function rowToReminder(r: Row): ReminderRow {
  return {
    id: r['id'] as string,
    title: r['title'] as string,
    ref_kind: (r['ref_kind'] ?? null) as string | null,
    ref_id: (r['ref_id'] ?? null) as string | null,
    notify_at: r['notify_at'] as number,
    rrule: (r['rrule'] ?? null) as string | null,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function createReminder(
  db: DbDriver,
  deviceId: string,
  input: CreateReminderInput,
): Promise<ReminderRow> {
  const reminder = {
    id: newId(),
    title: input.title,
    ref_kind: input.ref_kind ?? null,
    ref_id: input.ref_id ?? null,
    notify_at: input.notify_at,
    rrule: input.rrule ?? null,
    updated_at: now(),
    deleted_at: null,
  } satisfies ReminderRow;
  await localWrite(db, 'reminders', reminder, deviceId);
  return reminder;
}

export async function getReminder(db: DbDriver, id: string): Promise<ReminderRow | null> {
  const rows = await db.exec('SELECT * FROM reminders WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToReminder(r) : null;
}

export async function listReminders(db: DbDriver): Promise<ReminderRow[]> {
  const rows = await db.exec(
    'SELECT * FROM reminders WHERE deleted_at IS NULL ORDER BY notify_at ASC, id ASC',
  );
  return rows.map(rowToReminder);
}

export async function dueReminders(db: DbDriver, nowMs: number): Promise<ReminderRow[]> {
  const rows = await db.exec(
    'SELECT * FROM reminders WHERE notify_at <= ? AND deleted_at IS NULL ' +
      'ORDER BY notify_at ASC, id ASC',
    [nowMs],
  );
  return rows.map(rowToReminder);
}

export interface ReminderPatch {
  title?: string;
  notify_at?: number;
}

export async function updateReminder(
  db: DbDriver,
  deviceId: string,
  id: string,
  patch: ReminderPatch,
): Promise<ReminderRow | null> {
  const existing = await getReminder(db, id);
  if (!existing || existing.deleted_at !== null) return null;
  const updated = { ...existing, ...patch, updated_at: bumpedTs(existing.updated_at) };
  await localWrite(db, 'reminders', updated, deviceId);
  return updated;
}

export async function deleteReminder(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getReminder(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'reminders', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}
