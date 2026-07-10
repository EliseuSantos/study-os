import { newId, now, type FsrsStateRow } from '@studyos/shared';
import type { DbDriver, Row, Stmt } from '../driver';
import { localWriteStmts } from './oplog';
import { bumpedTs } from './ts';

export type RefKind = 'card' | 'topic';

// Structural copy of core's SchedulerState; db must not depend on @studyos/core.
export interface SchedulerStateShape {
  state: 'new' | 'learning' | 'review' | 'relearning';
  stability: number;
  difficulty: number;
  due_at: number | null;
  last_review: number | null;
  reps: number;
  lapses: number;
}

export interface RecordReviewArgs {
  refKind: RefKind;
  refId: string;
  next: SchedulerStateShape;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: number;
  elapsedMs?: number;
}

/**
 * Final shape (deviates from the contract sketch on purpose): never-reviewed
 * cards are due now but have no fsrs_state row, and read paths must not write —
 * so fsrs/dueAt are null for them instead of a synthesized row.
 */
export interface DueReview {
  refKind: RefKind;
  refId: string;
  title: string;
  dueAt: number | null;
  fsrs: FsrsStateRow | null;
}

function rowToFsrsState(r: Row): FsrsStateRow {
  return {
    id: r['id'] as string,
    ref_kind: r['ref_kind'] as string,
    ref_id: r['ref_id'] as string,
    state: r['state'] as string,
    stability: r['stability'] as number,
    difficulty: r['difficulty'] as number,
    due_at: (r['due_at'] ?? null) as number | null,
    last_review: (r['last_review'] ?? null) as number | null,
    reps: r['reps'] as number,
    lapses: r['lapses'] as number,
    updated_at: r['updated_at'] as number,
  };
}

export async function getFsrsState(
  db: DbDriver,
  refKind: RefKind,
  refId: string,
): Promise<FsrsStateRow | null> {
  const rows = await db.exec('SELECT * FROM fsrs_state WHERE ref_kind = ? AND ref_id = ?', [
    refKind,
    refId,
  ]);
  const r = rows[0];
  return r ? rowToFsrsState(r) : null;
}

/**
 * Upserts fsrs_state via the localWrite statements AND inserts the local-only
 * review_logs row in the SAME atomic batch (review_logs never hits the oplog).
 */
export async function recordReview(
  db: DbDriver,
  deviceId: string,
  args: RecordReviewArgs,
): Promise<FsrsStateRow> {
  const existing = await getFsrsState(db, args.refKind, args.refId);
  const state = {
    id: existing?.id ?? newId(),
    ref_kind: args.refKind,
    ref_id: args.refId,
    state: args.next.state,
    stability: args.next.stability,
    difficulty: args.next.difficulty,
    due_at: args.next.due_at,
    last_review: args.next.last_review,
    reps: args.next.reps,
    lapses: args.next.lapses,
    updated_at: existing ? bumpedTs(existing.updated_at) : now(),
  } satisfies FsrsStateRow;
  const logInsert: Stmt = {
    sql:
      'INSERT INTO review_logs (id, fsrs_id, rating, reviewed_at, elapsed_ms) ' +
      'VALUES (?, ?, ?, ?, ?)',
    params: [newId(), state.id, args.rating, args.reviewedAt, args.elapsedMs ?? null],
  };
  await db.batch([...localWriteStmts('fsrs_state', state, deviceId), logInsert]);
  return state;
}

/**
 * Due queue: fsrs_state rows with due_at <= now (joined to their ref title),
 * ordered by due_at asc, then never-reviewed cards (no fsrs_state row — due
 * now) by created_at asc. Soft-deleted refs are excluded. Read-only.
 */
export async function listDueReviews(
  db: DbDriver,
  nowTs: number,
  limit = 50,
): Promise<DueReview[]> {
  const dueRows = await db.exec(
    'SELECT f.*, c.front_md AS ref_title FROM fsrs_state f JOIN cards c ON c.id = f.ref_id ' +
      "WHERE f.ref_kind = 'card' AND f.due_at IS NOT NULL AND f.due_at <= ? " +
      'AND c.deleted_at IS NULL ' +
      'UNION ALL ' +
      'SELECT f.*, t.title AS ref_title FROM fsrs_state f JOIN topics t ON t.id = f.ref_id ' +
      "WHERE f.ref_kind = 'topic' AND f.due_at IS NOT NULL AND f.due_at <= ? " +
      'AND t.deleted_at IS NULL ' +
      'ORDER BY due_at ASC, id ASC LIMIT ?',
    [nowTs, nowTs, limit],
  );
  const out: DueReview[] = dueRows.map((r) => ({
    refKind: r['ref_kind'] as RefKind,
    refId: r['ref_id'] as string,
    title: r['ref_title'] as string,
    dueAt: r['due_at'] as number,
    fsrs: rowToFsrsState(r),
  }));
  if (out.length < limit) {
    const newRows = await db.exec(
      'SELECT c.id, c.front_md, c.created_at FROM cards c ' +
        "LEFT JOIN fsrs_state f ON f.ref_kind = 'card' AND f.ref_id = c.id " +
        'WHERE f.id IS NULL AND c.deleted_at IS NULL ' +
        'ORDER BY c.created_at ASC, c.id ASC LIMIT ?',
      [limit - out.length],
    );
    for (const r of newRows) {
      out.push({
        refKind: 'card',
        refId: r['id'] as string,
        title: r['front_md'] as string,
        dueAt: null,
        fsrs: null,
      });
    }
  }
  return out;
}
