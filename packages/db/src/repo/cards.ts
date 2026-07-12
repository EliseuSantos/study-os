import { newId, now, type CardRow } from '@studyos/shared';
import type { DbDriver, Row } from '../driver';
import { localWrite } from './oplog';
import { bumpedTs } from './ts';

export interface CreateCardInput {
  topic_id: string;
  kind?: string;
  front_md: string;
  back_md?: string | null;
  /** JSON CardSourceRef (see @studyos/shared) — origin of the card. */
  source_ref?: string | null;
}

function rowToCard(r: Row): CardRow {
  return {
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
  };
}

export async function createCard(
  db: DbDriver,
  deviceId: string,
  input: CreateCardInput,
): Promise<CardRow> {
  const ts = now();
  const card = {
    id: newId(),
    topic_id: input.topic_id,
    kind: input.kind ?? 'basic',
    front_md: input.front_md,
    back_md: input.back_md ?? null,
    options_json: null,
    source_ref: input.source_ref ?? null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  } satisfies CardRow;
  await localWrite(db, 'cards', card, deviceId);
  return card;
}

export async function getCard(db: DbDriver, id: string): Promise<CardRow | null> {
  const rows = await db.exec('SELECT * FROM cards WHERE id = ?', [id]);
  const r = rows[0];
  return r ? rowToCard(r) : null;
}

export async function listCardsByTopic(db: DbDriver, topicId: string): Promise<CardRow[]> {
  const rows = await db.exec(
    'SELECT * FROM cards WHERE topic_id = ? AND deleted_at IS NULL ' +
      'ORDER BY created_at ASC, id ASC',
    [topicId],
  );
  return rows.map(rowToCard);
}

export async function listCardsByTrack(db: DbDriver, trackId: string): Promise<CardRow[]> {
  const rows = await db.exec(
    'SELECT c.* FROM cards c JOIN topics t ON t.id = c.topic_id ' +
      'WHERE t.track_id = ? AND c.deleted_at IS NULL AND t.deleted_at IS NULL ' +
      'ORDER BY c.created_at ASC, c.id ASC',
    [trackId],
  );
  return rows.map(rowToCard);
}

export async function deleteCard(db: DbDriver, deviceId: string, id: string): Promise<void> {
  const existing = await getCard(db, id);
  if (!existing || existing.deleted_at !== null) return;
  const ts = bumpedTs(existing.updated_at);
  await localWrite(db, 'cards', { ...existing, deleted_at: ts, updated_at: ts }, deviceId);
}

export interface ErrorCardRow extends CardRow {
  topic_title: string;
  due_at: number | null;
}

/** Error-log cards of a track (kind='error') with topic title and next review. */
export async function listErrorCards(db: DbDriver, trackId: string): Promise<ErrorCardRow[]> {
  const rows = await db.exec(
    'SELECT c.*, t.title AS topic_title, f.due_at AS due_at FROM cards c ' +
      'JOIN topics t ON t.id = c.topic_id ' +
      "LEFT JOIN fsrs_state f ON f.ref_kind = 'card' AND f.ref_id = c.id " +
      "WHERE t.track_id = ? AND c.kind = 'error' AND c.deleted_at IS NULL " +
      'ORDER BY c.created_at DESC, c.id DESC',
    [trackId],
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
    topic_title: r['topic_title'] as string,
    due_at: (r['due_at'] ?? null) as number | null,
  }));
}
