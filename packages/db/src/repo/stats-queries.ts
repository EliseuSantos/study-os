import type { DbDriver, Row } from '../driver';
import type { TopicStatus } from './topics';

// Read-only feeds for core/stats and core/planner. Shapes mirror core's
// SessionSlice / ReviewSlice / PlannerTopic structurally; db must not depend
// on @studyos/core.

export interface SessionSliceRow {
  started_at: number;
  net_seconds: number;
  track_id: string | null;
  topic_id: string | null;
  questions_total: number | null;
  questions_correct: number | null;
  type: string;
}

export interface ReviewSliceRow {
  reviewed_at: number;
  rating: number;
  ref_id: string;
  ref_kind: string;
}

export interface PlannerTopicRow {
  id: string;
  track_id: string;
  title: string;
  status: TopicStatus;
  position: number;
  updated_at: number;
  deps: string[];
}

/** Ended sessions started at/after fromMs (running sessions have no net time yet). */
export async function sessionSlices(db: DbDriver, fromMs: number): Promise<SessionSliceRow[]> {
  const rows = await db.exec(
    'SELECT started_at, net_seconds, track_id, topic_id, questions_total, questions_correct, type ' +
      'FROM sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND deleted_at IS NULL ' +
      'ORDER BY started_at ASC, id ASC',
    [fromMs],
  );
  return rows.map((r) => ({
    started_at: r['started_at'] as number,
    net_seconds: r['net_seconds'] as number,
    track_id: (r['track_id'] ?? null) as string | null,
    topic_id: (r['topic_id'] ?? null) as string | null,
    questions_total: (r['questions_total'] ?? null) as number | null,
    type: r['type'] as string,
    questions_correct: (r['questions_correct'] ?? null) as number | null,
  }));
}

/** Review log entries at/after fromMs, joined to fsrs_state for the ref. */
export async function reviewSlices(db: DbDriver, fromMs: number): Promise<ReviewSliceRow[]> {
  const rows = await db.exec(
    'SELECT rl.reviewed_at, rl.rating, f.ref_id, f.ref_kind FROM review_logs rl ' +
      'JOIN fsrs_state f ON f.id = rl.fsrs_id WHERE rl.reviewed_at >= ? ' +
      'ORDER BY rl.reviewed_at ASC, rl.id ASC',
    [fromMs],
  );
  return rows.map((r) => ({
    reviewed_at: r['reviewed_at'] as number,
    rating: r['rating'] as number,
    ref_id: r['ref_id'] as string,
    ref_kind: r['ref_kind'] as string,
  }));
}

function rowToPlannerTopic(r: Row): PlannerTopicRow {
  const deps = r['deps'];
  return {
    id: r['id'] as string,
    track_id: r['track_id'] as string,
    title: r['title'] as string,
    status: r['status'] as TopicStatus,
    position: r['position'] as number,
    updated_at: r['updated_at'] as number,
    deps: typeof deps === 'string' && deps !== '' ? deps.split(',') : [],
  };
}

/** Live topics (optionally per track) with their dependency ids aggregated. */
export async function plannerTopics(db: DbDriver, trackIds?: string[]): Promise<PlannerTopicRow[]> {
  if (trackIds !== undefined && trackIds.length === 0) return [];
  const trackFilter =
    trackIds === undefined ? '' : `AND t.track_id IN (${trackIds.map(() => '?').join(',')}) `;
  const rows = await db.exec(
    'SELECT t.id, t.track_id, t.title, t.status, t.position, t.updated_at, ' +
      'GROUP_CONCAT(d.depends_on_id) AS deps FROM topics t ' +
      'LEFT JOIN topic_deps d ON d.topic_id = t.id ' +
      `WHERE t.deleted_at IS NULL ${trackFilter}` +
      'GROUP BY t.id ORDER BY t.position ASC, t.id ASC',
    trackIds ?? [],
  );
  return rows.map(rowToPlannerTopic);
}

export interface CardOriginStats {
  created: number;
  fromContent: number;
}

/** Cards created since fromMs and how many carry a source_ref (born from content). */
export async function cardOriginStats(db: DbDriver, fromMs: number): Promise<CardOriginStats> {
  const rows = await db.exec(
    'SELECT COUNT(*) AS created, SUM(CASE WHEN source_ref IS NOT NULL THEN 1 ELSE 0 END) AS from_content ' +
      'FROM cards WHERE created_at >= ? AND deleted_at IS NULL',
    [fromMs],
  );
  const r = rows[0];
  return {
    created: (r?.['created'] ?? 0) as number,
    fromContent: (r?.['from_content'] ?? 0) as number,
  };
}
