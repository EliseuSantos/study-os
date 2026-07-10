import {
  newId,
  now,
  type CardRow,
  type ContentItemRow,
  type LessonItemRow,
  type LessonRow,
  type TopicRow,
  type TrackRow,
} from '@studyos/shared';
import type { DbDriver, Stmt } from '../driver';
import { listCardsByTrack } from './cards';
import { localWriteStmts } from './oplog';
import { getTrack } from './tracks';
import { listTopics } from './topics';
import { listLessons } from './lessons';

// Structural copy of core's TrackSnapshot (openspec/specs/track-snapshot/spec.md); db must not
// depend on @studyos/core. Keys are LOCAL ordinals, not uuids.
export interface TrackSnapshotShape {
  format: 'studyos-track';
  version: 1;
  exported_at: number;
  track: { title: string; description: string | null; mode: string };
  topics: {
    key: number;
    parent_key: number | null;
    title: string;
    notes_md: string | null;
    position: number;
  }[];
  cards: {
    topic_key: number;
    kind: string;
    front_md: string;
    back_md: string | null;
    options_json: string | null;
  }[];
  lessons: {
    key: number;
    title: string;
    presenter_notes_md: string | null;
    estimated_duration_min: number | null;
    position: number;
  }[];
  lesson_items: {
    lesson_key: number;
    topic_key: number | null;
    kind: string;
    body_md: string | null;
    position: number;
  }[];
  content: {
    topic_key: number;
    source: string;
    external_id: string | null;
    url: string | null;
    title: string;
    kind: string;
  }[];
}

export interface TrackExport {
  track: TrackRow;
  topics: TopicRow[];
  cards: CardRow[];
  lessons: LessonRow[];
  lessonItems: LessonItemRow[];
  content: ContentItemRow[];
}

/** Everything core's buildSnapshot needs, rows as-is (not-deleted only). */
export async function exportTrackData(db: DbDriver, trackId: string): Promise<TrackExport> {
  const [track, topics, cards, lessons, lessonItemRows, contentRows] = await Promise.all([
    getTrack(db, trackId),
    listTopics(db, trackId),
    listCardsByTrack(db, trackId),
    listLessons(db, trackId),
    db.exec(
      'SELECT li.* FROM lesson_items li JOIN lessons l ON l.id = li.lesson_id ' +
        'WHERE l.track_id = ? AND li.deleted_at IS NULL AND l.deleted_at IS NULL ' +
        'ORDER BY l.position ASC, li.position ASC, li.id ASC',
      [trackId],
    ),
    db.exec(
      'SELECT ci.* FROM content_items ci JOIN topics t ON t.id = ci.topic_id ' +
        'WHERE t.track_id = ? AND ci.deleted_at IS NULL AND t.deleted_at IS NULL ' +
        'ORDER BY ci.added_at ASC, ci.id ASC',
      [trackId],
    ),
  ]);
  if (!track || track.deleted_at !== null) throw new Error(`track not found: ${trackId}`);
  return {
    track,
    topics,
    cards,
    lessons,
    lessonItems: lessonItemRows.map((r) => ({
      id: r['id'] as string,
      lesson_id: r['lesson_id'] as string,
      topic_id: (r['topic_id'] ?? null) as string | null,
      content_item_id: (r['content_item_id'] ?? null) as string | null,
      kind: r['kind'] as string,
      body_md: (r['body_md'] ?? null) as string | null,
      position: r['position'] as number,
      updated_at: r['updated_at'] as number,
      deleted_at: (r['deleted_at'] ?? null) as number | null,
    })),
    content: contentRows.map((r) => ({
      id: r['id'] as string,
      topic_id: (r['topic_id'] ?? null) as string | null,
      source: r['source'] as string,
      external_id: (r['external_id'] ?? null) as string | null,
      url: (r['url'] ?? null) as string | null,
      title: r['title'] as string,
      kind: r['kind'] as string,
      meta_json: (r['meta_json'] ?? null) as string | null,
      added_at: r['added_at'] as number,
      updated_at: r['updated_at'] as number,
      deleted_at: (r['deleted_at'] ?? null) as number | null,
    })),
  };
}

function resolveTopic(map: Map<number, string>, key: number, where: string): string {
  const id = map.get(key);
  if (id === undefined)
    throw new Error(`invalid snapshot: ${where} references unknown topic key ${key}`);
  return id;
}

/**
 * Materializes a snapshot as a brand-new track in ONE atomic batch (mirrors
 * createTopicTree): track + topics + cards + lessons + lesson_items +
 * content_items, each write paired with its oplog row. Imported cards start
 * fresh — no fsrs rows, so they surface as new/due in Today. Returns the new
 * track id.
 */
export async function importSnapshot(
  db: DbDriver,
  deviceId: string,
  s: TrackSnapshotShape,
  origin: { origin: string; origin_version: string },
): Promise<string> {
  const ts = now();
  const stmts: Stmt[] = [];

  const track = {
    id: newId(),
    goal_id: null,
    title: s.track.title,
    description: s.track.description,
    mode: s.track.mode,
    origin: origin.origin,
    origin_version: origin.origin_version,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  } satisfies TrackRow;
  stmts.push(...localWriteStmts('tracks', track, deviceId));

  const topicIds = new Map<number, string>();
  for (const t of s.topics) {
    if (topicIds.has(t.key)) throw new Error(`invalid snapshot: duplicate topic key ${t.key}`);
    topicIds.set(t.key, newId());
  }
  for (const t of s.topics) {
    const parentId = t.parent_key === null ? null : topicIds.get(t.parent_key);
    if (parentId === undefined) {
      throw new Error(
        `invalid snapshot: topic ${t.key} references unknown parent key ${t.parent_key}`,
      );
    }
    const topic = {
      id: topicIds.get(t.key) as string,
      track_id: track.id,
      parent_id: parentId,
      title: t.title,
      notes_md: t.notes_md,
      position: t.position,
      status: 'pending',
      updated_at: ts,
      deleted_at: null,
    } satisfies TopicRow;
    stmts.push(...localWriteStmts('topics', topic, deviceId));
  }

  for (const c of s.cards) {
    const card = {
      id: newId(),
      topic_id: resolveTopic(topicIds, c.topic_key, 'card'),
      kind: c.kind,
      front_md: c.front_md,
      back_md: c.back_md,
      options_json: c.options_json,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    } satisfies CardRow;
    stmts.push(...localWriteStmts('cards', card, deviceId));
  }

  const lessonIds = new Map<number, string>();
  for (const l of s.lessons) {
    if (lessonIds.has(l.key)) throw new Error(`invalid snapshot: duplicate lesson key ${l.key}`);
    lessonIds.set(l.key, newId());
    const lesson = {
      id: lessonIds.get(l.key) as string,
      track_id: track.id,
      title: l.title,
      presenter_notes_md: l.presenter_notes_md,
      estimated_duration_min: l.estimated_duration_min,
      position: l.position,
      updated_at: ts,
      deleted_at: null,
    } satisfies LessonRow;
    stmts.push(...localWriteStmts('lessons', lesson, deviceId));
  }

  for (const li of s.lesson_items) {
    const lessonId = lessonIds.get(li.lesson_key);
    if (lessonId === undefined) {
      throw new Error(
        `invalid snapshot: lesson item references unknown lesson key ${li.lesson_key}`,
      );
    }
    const item = {
      id: newId(),
      lesson_id: lessonId,
      topic_id: li.topic_key === null ? null : resolveTopic(topicIds, li.topic_key, 'lesson item'),
      content_item_id: null,
      kind: li.kind,
      body_md: li.body_md,
      position: li.position,
      updated_at: ts,
      deleted_at: null,
    } satisfies LessonItemRow;
    stmts.push(...localWriteStmts('lesson_items', item, deviceId));
  }

  for (const ci of s.content) {
    const item = {
      id: newId(),
      topic_id: resolveTopic(topicIds, ci.topic_key, 'content item'),
      source: ci.source,
      external_id: ci.external_id,
      url: ci.url,
      title: ci.title,
      kind: ci.kind,
      meta_json: null,
      added_at: ts,
      updated_at: ts,
      deleted_at: null,
    } satisfies ContentItemRow;
    stmts.push(...localWriteStmts('content_items', item, deviceId));
  }

  await db.batch(stmts);
  return track.id;
}
