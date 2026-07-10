import { newId, now, type TargetRow } from '@studyos/shared';
import type { DbDriver, Row, SqlValue } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateTargetInput {
  track_id?: string | null;
  metric: string;
  period: string;
  value: number;
}

function rowToTarget(r: Row): TargetRow {
  return {
    id: r['id'] as string,
    track_id: (r['track_id'] ?? null) as string | null,
    metric: r['metric'] as string,
    period: r['period'] as string,
    value: r['value'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  };
}

export async function createTarget(
  db: DbDriver,
  deviceId: string,
  input: CreateTargetInput,
): Promise<TargetRow> {
  const target = {
    id: newId(),
    track_id: input.track_id ?? null,
    metric: input.metric,
    period: input.period,
    value: input.value,
    updated_at: now(),
    deleted_at: null,
  } satisfies TargetRow;
  await localWrite(db, 'targets', target, deviceId);
  return target;
}

export async function getTarget(db: DbDriver, id: string): Promise<TargetRow | null> {
  const rows = await db.exec('SELECT * FROM targets WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToTarget(r) : null;
}

export async function listTargets(db: DbDriver): Promise<TargetRow[]> {
  const rows = await db.exec(
    'SELECT * FROM targets WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC',
  );
  return rows.map(rowToTarget);
}

export async function deleteTarget(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getTarget(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'targets', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}

// Start of the current period in LOCAL time: midnight today for 'day', Monday's
// midnight for 'week', the 1st for 'month'. new Date is fine here — this repo
// runs on the client (and in tests), never in the worker.
function periodStart(period: string, nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (period === 'month') d.setDate(1);
  return d.getTime();
}

async function countScalar(db: DbDriver, sql: string, params: SqlValue[]): Promise<number> {
  const rows = await db.exec(sql, params);
  return (rows[0]?.['n'] ?? 0) as number;
}

async function sessionMetric(
  db: DbDriver,
  select: string,
  target: TargetRow,
  fromMs: number,
  nowMs: number,
): Promise<number> {
  const trackFilter = target.track_id === null ? '' : 'AND track_id = ? ';
  const params: SqlValue[] = [fromMs, nowMs];
  if (target.track_id !== null) params.push(target.track_id);
  return countScalar(
    db,
    `SELECT ${select} AS n FROM sessions ` +
      `WHERE started_at >= ? AND started_at <= ? AND deleted_at IS NULL ${trackFilter}`,
    params,
  );
}

// review_logs carries no track; resolve the ref through fsrs_state to either a
// topic in the track or a card whose topic is in the track.
async function reviewCount(
  db: DbDriver,
  target: TargetRow,
  fromMs: number,
  nowMs: number,
): Promise<number> {
  if (target.track_id === null) {
    return countScalar(
      db,
      'SELECT COUNT(*) AS n FROM review_logs WHERE reviewed_at >= ? AND reviewed_at <= ?',
      [fromMs, nowMs],
    );
  }
  return countScalar(
    db,
    'SELECT COUNT(*) AS n FROM review_logs rl ' +
      'JOIN fsrs_state f ON f.id = rl.fsrs_id ' +
      "LEFT JOIN topics tt ON f.ref_kind = 'topic' AND tt.id = f.ref_id " +
      "LEFT JOIN cards c ON f.ref_kind = 'card' AND c.id = f.ref_id " +
      'LEFT JOIN topics ct ON ct.id = c.topic_id ' +
      'WHERE rl.reviewed_at >= ? AND rl.reviewed_at <= ? ' +
      'AND (tt.track_id = ? OR ct.track_id = ?)',
    [fromMs, nowMs, target.track_id, target.track_id],
  );
}

/** Progress 0..1 of a target over its current period (window = period start → now). */
export async function targetProgress(
  db: DbDriver,
  target: TargetRow,
  nowMs: number,
): Promise<number> {
  if (target.value <= 0) return 0;
  const fromMs = periodStart(target.period, nowMs);
  let ratio: number;
  switch (target.metric) {
    case 'net_hours': {
      const seconds = await sessionMetric(
        db,
        'COALESCE(SUM(net_seconds), 0)',
        target,
        fromMs,
        nowMs,
      );
      ratio = seconds / 3600 / target.value;
      break;
    }
    case 'questions': {
      const questions = await sessionMetric(
        db,
        'COALESCE(SUM(questions_total), 0)',
        target,
        fromMs,
        nowMs,
      );
      ratio = questions / target.value;
      break;
    }
    case 'sessions': {
      const count = await sessionMetric(db, 'COUNT(*)', target, fromMs, nowMs);
      ratio = count / target.value;
      break;
    }
    case 'reviews': {
      const count = await reviewCount(db, target, fromMs, nowMs);
      ratio = count / target.value;
      break;
    }
    default:
      throw new Error(`unknown target metric: ${target.metric}`);
  }
  return Math.min(1, Math.max(0, ratio));
}
