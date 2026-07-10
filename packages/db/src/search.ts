import type { DbDriver } from './driver';

export interface SearchHit {
  kind: 'topic' | 'card' | 'content';
  ref_id: string;
  title: string;
  snippet: string;
}

// Local-only FTS5 index. NOT in the shared migrations and NOT a synced table:
// D1 lacks FTS5, so each device builds its own index (ensureSearchIndex after
// migrate, reindexAll on app open / after imports). Incremental maintenance on
// every repo write is an M6 candidate — at M4 scale a full rebuild is cheap.
export async function ensureSearchIndex(db: DbDriver): Promise<void> {
  await db.exec(
    'CREATE VIRTUAL TABLE IF NOT EXISTS search_index ' +
      'USING fts5(title, body, kind UNINDEXED, ref_id UNINDEXED)',
  );
}

/** Full rebuild from topics, cards and content_items, in one atomic batch. */
export async function reindexAll(db: DbDriver): Promise<void> {
  await db.batch([
    { sql: 'DELETE FROM search_index' },
    {
      sql:
        'INSERT INTO search_index (title, body, kind, ref_id) ' +
        "SELECT title, coalesce(notes_md, ''), 'topic', id FROM topics WHERE deleted_at IS NULL",
    },
    {
      sql:
        'INSERT INTO search_index (title, body, kind, ref_id) ' +
        "SELECT front_md, coalesce(back_md, ''), 'card', id FROM cards WHERE deleted_at IS NULL",
    },
    {
      sql:
        'INSERT INTO search_index (title, body, kind, ref_id) ' +
        "SELECT title, '', 'content', id FROM content_items WHERE deleted_at IS NULL",
    },
  ]);
}

// Strip fts5 query syntax so user input can never be parsed as operators.
// Each surviving token is emitted as a quoted prefix term ("tok"*) — quoting
// neutralizes leftover punctuation and keywords like OR/NOT/NEAR.
function toMatchExpr(q: string): string | null {
  const cleaned = q
    .replace(/["*():^-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  return cleaned
    .split(' ')
    .map((tok) => `"${tok}"*`)
    .join(' ');
}

export async function searchLocal(db: DbDriver, q: string, limit = 20): Promise<SearchHit[]> {
  const match = toMatchExpr(q);
  if (match === null) return [];
  const rows = await db.exec(
    'SELECT kind, ref_id, title, ' +
      "snippet(search_index, 1, '[', ']', '…', 8) AS snippet " +
      'FROM search_index WHERE search_index MATCH ? ' +
      'ORDER BY bm25(search_index) LIMIT ?',
    [match, limit],
  );
  return rows.map((r) => ({
    kind: r['kind'] as SearchHit['kind'],
    ref_id: r['ref_id'] as string,
    title: r['title'] as string,
    snippet: r['snippet'] as string,
  }));
}
