import { newId, now, type CardRow, type FsrsStateRow } from '@studyos/shared';
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
        'WHERE (f.id IS NULL OR (f.reps = 0 AND f.due_at IS NULL)) AND c.deleted_at IS NULL ' +
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

/**
 * Undo the most recent review of a ref: restore the given prior scheduler
 * state (snapshot taken before rating) and drop the newest review_log row.
 * `prior === null` (first review undone) rewrites the row as a pristine
 * "new" state KEEPING its id — deleting it locally would leave the server
 * copy alive and the next review's fresh id would violate the server's
 * UNIQUE(ref_kind, ref_id). The queue treats reps=0/due null as never
 * reviewed.
 */
export async function undoLastReview(
  db: DbDriver,
  deviceId: string,
  refKind: RefKind,
  refId: string,
  prior: FsrsStateRow | null,
): Promise<void> {
  const current = await getFsrsState(db, refKind, refId);
  if (!current) return;
  const dropLog: Stmt = {
    sql:
      'DELETE FROM review_logs WHERE id = (SELECT id FROM review_logs WHERE fsrs_id = ? ' +
      'ORDER BY reviewed_at DESC, id DESC LIMIT 1)',
    params: [current.id],
  };
  if (prior === null) {
    const pristine = {
      ...current,
      state: 'new',
      stability: 0,
      difficulty: 0,
      due_at: null,
      last_review: null,
      reps: 0,
      lapses: 0,
      updated_at: bumpedTs(current.updated_at),
    } satisfies FsrsStateRow;
    await db.batch([...localWriteStmts('fsrs_state', pristine, deviceId), dropLog]);
    return;
  }
  const restored = { ...prior, id: current.id, updated_at: bumpedTs(current.updated_at) };
  await db.batch([...localWriteStmts('fsrs_state', restored, deviceId), dropLog]);
}

/** Quiz cards of a topic (kind='quiz', not deleted), position order. */
export async function listQuizCards(db: DbDriver, topicId: string): Promise<CardRow[]> {
  const rows = await db.exec(
    "SELECT * FROM cards WHERE topic_id = ? AND kind = 'quiz' AND deleted_at IS NULL " +
      'ORDER BY created_at ASC, id ASC',
    [topicId],
  );
  return rows.map((r) => ({
    id: r['id'] as string,
    topic_id: r['topic_id'] as string,
    kind: r['kind'] as string,
    front_md: r['front_md'] as string,
    back_md: (r['back_md'] ?? null) as string | null,
    options_json: (r['options_json'] ?? null) as string | null,
    source_ref: (r['source_ref'] ?? null) as string | null,
    created_at: r['created_at'] as number,
    updated_at: r['updated_at'] as number,
    deleted_at: (r['deleted_at'] ?? null) as number | null,
  }));
}

/** Due refs per day-bucket for the forecast (start..start+horizon days). */
export async function dueByDay(
  db: DbDriver,
  startMidnight: number,
  horizonDays: number,
): Promise<number[]> {
  const end = startMidnight + horizonDays * 86_400_000;
  const rows = await db.exec(
    'SELECT CAST((due_at - ?) / 86400000 AS INTEGER) AS day, COUNT(*) AS n FROM fsrs_state ' +
      'WHERE due_at IS NOT NULL AND due_at >= ? AND due_at < ? GROUP BY day',
    [startMidnight, startMidnight, end],
  );
  const out = Array.from({ length: horizonDays }, () => 0);
  for (const r of rows) {
    const day = r['day'] as number;
    if (day >= 0 && day < horizonDays) out[day] = r['n'] as number;
  }
  return out;
}
