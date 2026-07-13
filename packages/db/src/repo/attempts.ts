import { newId } from '@studyos/shared';
import type { DbDriver } from '../driver';

// question_attempts is local-only (like review_logs): no updated_at, never
// synced — the per-question error rate is a device-local heuristic.

export async function recordAttempt(
  db: DbDriver,
  cardId: string,
  correct: boolean,
  attemptedAt: number,
): Promise<void> {
  await db.exec(
    'INSERT INTO question_attempts (id, card_id, correct, attempted_at) VALUES (?, ?, ?, ?)',
    [newId(), cardId, correct ? 1 : 0, attemptedAt],
  );
}

export interface AttemptStats {
  card_id: string;
  attempts: number;
  wrong: number;
}

/** Attempt totals per quiz card of a topic. */
export async function attemptStatsByTopic(
  db: DbDriver,
  topicId: string,
): Promise<Map<string, AttemptStats>> {
  const rows = await db.exec(
    'SELECT qa.card_id AS card_id, COUNT(*) AS attempts, ' +
      'SUM(CASE WHEN qa.correct = 0 THEN 1 ELSE 0 END) AS wrong ' +
      'FROM question_attempts qa JOIN cards c ON c.id = qa.card_id ' +
      'WHERE c.topic_id = ? GROUP BY qa.card_id',
    [topicId],
  );
  const out = new Map<string, AttemptStats>();
  for (const r of rows) {
    out.set(r['card_id'] as string, {
      card_id: r['card_id'] as string,
      attempts: r['attempts'] as number,
      wrong: (r['wrong'] ?? 0) as number,
    });
  }
  return out;
}
