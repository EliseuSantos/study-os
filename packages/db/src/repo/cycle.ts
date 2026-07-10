import { newId, now, type CycleSlotRow } from '@studyos/shared';
import type { DbDriver, Row, Stmt } from '../driver';
import { localWriteStmts } from './oplog';
import { getSetting, setSetting } from './settings';
import { bumpedTs } from './ts';

export interface CycleSlotInput {
  topic_id: string;
  weight: number;
}

function rowToCycleSlot(r: Row): CycleSlotRow {
  return {
    id: r['id'] as string,
    track_id: r['track_id'] as string,
    topic_id: r['topic_id'] as string,
    weight: r['weight'] as number,
    position: r['position'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function listCycleSlots(db: DbDriver, trackId: string): Promise<CycleSlotRow[]> {
  const rows = await db.exec(
    'SELECT * FROM cycle_slots WHERE track_id = ? AND deleted_at IS NULL ' +
      'ORDER BY position ASC, id ASC',
    [trackId],
  );
  return rows.map(rowToCycleSlot);
}

/**
 * Replace-all: soft-deletes the track's current slots and inserts the new list
 * (position = index, weight clamped >= 1) in ONE atomic batch.
 */
export async function setCycleSlots(
  db: DbDriver,
  deviceId: string,
  trackId: string,
  slots: CycleSlotInput[],
): Promise<void> {
  const existing = await listCycleSlots(db, trackId);
  const stmts: Stmt[] = [];
  for (const slot of existing) {
    const ts = bumpedTs(slot.updated_at);
    stmts.push(
      ...localWriteStmts('cycle_slots', { ...slot, deleted_at: ts, updated_at: ts }, deviceId),
    );
  }
  const ts = now();
  slots.forEach((slot, position) => {
    const row = {
      id: newId(),
      track_id: trackId,
      topic_id: slot.topic_id,
      weight: Math.max(1, Math.floor(slot.weight)),
      position,
      updated_at: ts,
      deleted_at: null,
    } satisfies CycleSlotRow;
    stmts.push(...localWriteStmts('cycle_slots', row, deviceId));
  });
  if (stmts.length > 0) await db.batch(stmts);
}

// The cycle pointer (total picks already made, consumed by core's cycleNext) is
// a per-device cursor, so it lives in local-only settings — never in the oplog.
function pointerKey(trackId: string): string {
  return `cycle_pointer:${trackId}`;
}

export async function getCyclePointer(db: DbDriver, trackId: string): Promise<number> {
  const raw = await getSetting(db, pointerKey(trackId));
  if (raw === null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setCyclePointer(db: DbDriver, trackId: string, n: number): Promise<void> {
  await setSetting(db, pointerKey(trackId), String(n));
}
