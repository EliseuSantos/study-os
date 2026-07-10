// M5 snapshot: the `.studyos.json` track export format (specs/track-snapshot.md,
// frozen). Pure module: rows in → portable snapshot out, plus validation and a
// deterministic content hash. Row inputs are LOCAL structural shapes — any
// object with these fields works (packages/db rows are supersets).

export const SNAPSHOT_FORMAT = 'studyos-track';
export const SNAPSHOT_VERSION = 1;

export interface TrackSnapshot {
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
  }[]; // keys are LOCAL ordinals, not uuids
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
  }[]; // content items export as kind 'note' with body_md = title+url markdown
  content: {
    topic_key: number;
    source: string;
    external_id: string | null;
    url: string | null;
    title: string;
    kind: string;
  }[];
}

// Structural row shapes local to core — only the fields the snapshot needs.
export interface TrackRowShape {
  title: string;
  description: string | null;
  mode: string;
}
export interface TopicRowShape {
  id: string;
  parent_id: string | null;
  title: string;
  notes_md: string | null;
  position: number;
}
export interface CardRowShape {
  topic_id: string;
  kind: string;
  front_md: string;
  back_md: string | null;
  options_json: string | null;
}
export interface LessonRowShape {
  id: string;
  title: string;
  presenter_notes_md: string | null;
  estimated_duration_min: number | null;
  position: number;
}
export interface LessonItemRowShape {
  lesson_id: string;
  topic_id: string | null;
  content_item_id: string | null;
  kind: string;
  body_md: string | null;
  position: number;
}
export interface ContentRowShape {
  id: string;
  topic_id: string | null;
  source: string;
  external_id: string | null;
  url: string | null;
  title: string;
  kind: string;
}

export interface BuildSnapshotInput {
  track: TrackRowShape;
  topics: TopicRowShape[];
  cards: CardRowShape[];
  lessons: LessonRowShape[];
  lessonItems: LessonItemRowShape[];
  content: ContentRowShape[];
}

const byPosition = <T extends { position: number; title: string }>(a: T, b: T): number =>
  a.position - b.position || a.title.localeCompare(b.title);

/**
 * Build a portable snapshot from track rows. Topic uuids become local ordinal
 * keys assigned by a parents-first pre-order walk (roots by position, then
 * each subtree by position), so `parent_key < key` always holds. Lesson keys
 * are ordinals in position order. Lesson items of kind 'content' are exported
 * as kind 'note' with `body_md = [<title>](<url>)` — content ids don't travel.
 * Rows referencing unknown uuids (e.g. a soft-deleted topic) are skipped.
 *
 * `exportedAt` defaults to Date.now(); pass it explicitly for determinism.
 */
export function buildSnapshot(
  input: BuildSnapshotInput,
  exportedAt: number = Date.now(),
): TrackSnapshot {
  // Parents-first pre-order walk over the topic tree.
  const topicIds = new Set(input.topics.map((t) => t.id));
  const children = new Map<string | null, TopicRowShape[]>();
  for (const topic of input.topics) {
    // Orphans (parent uuid not exported) are treated as roots.
    const parent =
      topic.parent_id !== null && topicIds.has(topic.parent_id) ? topic.parent_id : null;
    const siblings = children.get(parent);
    if (siblings) siblings.push(topic);
    else children.set(parent, [topic]);
  }
  const topicKey = new Map<string, number>();
  const topics: TrackSnapshot['topics'] = [];
  const walk = (parentId: string | null, parentKey: number | null): void => {
    const siblings = children.get(parentId);
    if (!siblings) return;
    for (const topic of siblings.toSorted(byPosition)) {
      const key = topicKey.size;
      topicKey.set(topic.id, key);
      topics.push({
        key,
        parent_key: parentKey,
        title: topic.title,
        notes_md: topic.notes_md,
        position: topic.position,
      });
      walk(topic.id, key);
    }
  };
  walk(null, null);

  const cards: TrackSnapshot['cards'] = [];
  for (const card of input.cards) {
    const key = topicKey.get(card.topic_id);
    if (key === undefined) continue;
    cards.push({
      topic_key: key,
      kind: card.kind,
      front_md: card.front_md,
      back_md: card.back_md,
      options_json: card.options_json,
    });
  }

  const lessonKey = new Map<string, number>();
  const lessons: TrackSnapshot['lessons'] = [];
  for (const lesson of input.lessons.toSorted(byPosition)) {
    const key = lessonKey.size;
    lessonKey.set(lesson.id, key);
    lessons.push({
      key,
      title: lesson.title,
      presenter_notes_md: lesson.presenter_notes_md,
      estimated_duration_min: lesson.estimated_duration_min,
      position: lesson.position,
    });
  }

  const contentById = new Map(input.content.map((c) => [c.id, c]));
  const lessonItems: TrackSnapshot['lesson_items'] = [];
  for (const item of input.lessonItems.toSorted((a, b) => a.position - b.position)) {
    const key = lessonKey.get(item.lesson_id);
    if (key === undefined) continue;
    const topic = item.topic_id !== null ? (topicKey.get(item.topic_id) ?? null) : null;
    const linked =
      item.content_item_id !== null ? contentById.get(item.content_item_id) : undefined;
    if (item.kind === 'content') {
      lessonItems.push({
        lesson_key: key,
        topic_key: topic,
        kind: 'note',
        body_md: linked ? `[${linked.title}](${linked.url ?? ''})` : item.body_md,
        position: item.position,
      });
    } else {
      lessonItems.push({
        lesson_key: key,
        topic_key: topic,
        kind: item.kind,
        body_md: item.body_md,
        position: item.position,
      });
    }
  }

  const content: TrackSnapshot['content'] = [];
  for (const row of input.content) {
    const key = row.topic_id !== null ? topicKey.get(row.topic_id) : undefined;
    if (key === undefined) continue; // topic-less content can't be keyed
    content.push({
      topic_key: key,
      source: row.source,
      external_id: row.external_id,
      url: row.url,
      title: row.title,
      kind: row.kind,
    });
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    exported_at: exportedAt,
    track: {
      title: input.track.title,
      description: input.track.description,
      mode: input.track.mode,
    },
    topics,
    cards,
    lessons,
    lesson_items: lessonItems,
    content,
  };
}

// ---------------------------------------------------------------------------
// parseSnapshot — structural validation of untrusted json.

function fail(reason: string): never {
  throw new Error(`invalid snapshot: ${reason}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(`${path} must be a string`);
  return v;
}

function strOrNull(v: unknown, path: string): string | null {
  if (v !== null && typeof v !== 'string') fail(`${path} must be a string or null`);
  return v;
}

function finiteNum(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path} must be a finite number`);
  return v;
}

function finiteNumOrNull(v: unknown, path: string): number | null {
  if (v === null) return null;
  return finiteNum(v, path);
}

/** Local ordinal key: integer >= 0. */
function ordinal(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    fail(`${path} must be an integer >= 0`);
  }
  return v;
}

function ordinalOrNull(v: unknown, path: string): number | null {
  if (v === null) return null;
  return ordinal(v, path);
}

function arrayOf(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(`${path} must be an array`);
  return v;
}

function recordAt(v: unknown, path: string): Record<string, unknown> {
  if (!isRecord(v)) fail(`${path} must be an object`);
  return v;
}

/**
 * Parse and validate a `.studyos.json` string. Every field is checked
 * (types, key ordinals, referential integrity of parent/topic/lesson keys).
 * Returns a clean TrackSnapshot with unknown extra fields stripped.
 * Throws `Error('invalid snapshot: <reason>')` on any problem.
 */
export function parseSnapshot(json: string): TrackSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    fail('not valid JSON');
  }
  if (!isRecord(raw)) fail('root must be an object');
  if (raw['format'] !== SNAPSHOT_FORMAT) fail(`format must be '${SNAPSHOT_FORMAT}'`);
  if (raw['version'] !== SNAPSHOT_VERSION) fail(`version must be ${SNAPSHOT_VERSION}`);
  const exportedAt = finiteNum(raw['exported_at'], 'exported_at');

  const trackRaw = recordAt(raw['track'], 'track');
  const title = str(trackRaw['title'], 'track.title');
  if (title.trim() === '') fail('track.title must not be empty');
  const track = {
    title,
    description: strOrNull(trackRaw['description'], 'track.description'),
    mode: str(trackRaw['mode'], 'track.mode'),
  };

  const topicKeys = new Set<number>();
  const topics = arrayOf(raw['topics'], 'topics').map((entry, i) => {
    const t = recordAt(entry, `topics[${i}]`);
    const key = ordinal(t['key'], `topics[${i}].key`);
    if (topicKeys.has(key)) fail(`topics[${i}].key ${key} is duplicated`);
    topicKeys.add(key);
    return {
      key,
      parent_key: ordinalOrNull(t['parent_key'], `topics[${i}].parent_key`),
      title: str(t['title'], `topics[${i}].title`),
      notes_md: strOrNull(t['notes_md'], `topics[${i}].notes_md`),
      position: finiteNum(t['position'], `topics[${i}].position`),
    };
  });
  topics.forEach((t, i) => {
    if (t.parent_key !== null && !topicKeys.has(t.parent_key)) {
      fail(`topics[${i}].parent_key ${t.parent_key} does not exist`);
    }
    if (t.parent_key === t.key) fail(`topics[${i}].parent_key must not equal its own key`);
  });

  const cards = arrayOf(raw['cards'], 'cards').map((entry, i) => {
    const c = recordAt(entry, `cards[${i}]`);
    const topicKey = ordinal(c['topic_key'], `cards[${i}].topic_key`);
    if (!topicKeys.has(topicKey)) fail(`cards[${i}].topic_key ${topicKey} does not exist`);
    return {
      topic_key: topicKey,
      kind: str(c['kind'], `cards[${i}].kind`),
      front_md: str(c['front_md'], `cards[${i}].front_md`),
      back_md: strOrNull(c['back_md'], `cards[${i}].back_md`),
      options_json: strOrNull(c['options_json'], `cards[${i}].options_json`),
    };
  });

  const lessonKeys = new Set<number>();
  const lessons = arrayOf(raw['lessons'], 'lessons').map((entry, i) => {
    const l = recordAt(entry, `lessons[${i}]`);
    const key = ordinal(l['key'], `lessons[${i}].key`);
    if (lessonKeys.has(key)) fail(`lessons[${i}].key ${key} is duplicated`);
    lessonKeys.add(key);
    return {
      key,
      title: str(l['title'], `lessons[${i}].title`),
      presenter_notes_md: strOrNull(l['presenter_notes_md'], `lessons[${i}].presenter_notes_md`),
      estimated_duration_min: finiteNumOrNull(
        l['estimated_duration_min'],
        `lessons[${i}].estimated_duration_min`,
      ),
      position: finiteNum(l['position'], `lessons[${i}].position`),
    };
  });

  const lessonItems = arrayOf(raw['lesson_items'], 'lesson_items').map((entry, i) => {
    const li = recordAt(entry, `lesson_items[${i}]`);
    const lessonKey = ordinal(li['lesson_key'], `lesson_items[${i}].lesson_key`);
    if (!lessonKeys.has(lessonKey)) {
      fail(`lesson_items[${i}].lesson_key ${lessonKey} does not exist`);
    }
    const topicKey = ordinalOrNull(li['topic_key'], `lesson_items[${i}].topic_key`);
    if (topicKey !== null && !topicKeys.has(topicKey)) {
      fail(`lesson_items[${i}].topic_key ${topicKey} does not exist`);
    }
    return {
      lesson_key: lessonKey,
      topic_key: topicKey,
      kind: str(li['kind'], `lesson_items[${i}].kind`),
      body_md: strOrNull(li['body_md'], `lesson_items[${i}].body_md`),
      position: finiteNum(li['position'], `lesson_items[${i}].position`),
    };
  });

  const content = arrayOf(raw['content'], 'content').map((entry, i) => {
    const c = recordAt(entry, `content[${i}]`);
    const topicKey = ordinal(c['topic_key'], `content[${i}].topic_key`);
    if (!topicKeys.has(topicKey)) fail(`content[${i}].topic_key ${topicKey} does not exist`);
    return {
      topic_key: topicKey,
      source: str(c['source'], `content[${i}].source`),
      external_id: strOrNull(c['external_id'], `content[${i}].external_id`),
      url: strOrNull(c['url'], `content[${i}].url`),
      title: str(c['title'], `content[${i}].title`),
      kind: str(c['kind'], `content[${i}].kind`),
    };
  });

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    exported_at: exportedAt,
    track,
    topics,
    cards,
    lessons,
    lesson_items: lessonItems,
    content,
  };
}

// ---------------------------------------------------------------------------
// snapshotHash — deterministic content hash. Canonical JSON (object keys
// recursively sorted, exported_at excluded) hashed with FNV-1a 64-bit.

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('cannot hash non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (isRecord(value)) {
    const parts: string[] = [];
    for (const key of Object.keys(value).toSorted()) {
      const v = value[key];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonical(v)}`);
    }
    return `{${parts.join(',')}}`;
  }
  fail(`cannot hash value of type ${typeof value}`);
}

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * Deterministic 16-hex content hash of a snapshot: canonical JSON with
 * recursively sorted object keys, `exported_at` excluded, folded through
 * FNV-1a 64-bit (each UTF-16 code unit fed as two big-endian bytes).
 * Pure BigInt arithmetic — no crypto dependency; identical output in the
 * PWA and the worker (both import this function).
 */
export function snapshotHash(s: TrackSnapshot): string {
  const { exported_at: _exportedAt, ...rest } = s;
  void _exportedAt;
  const text = canonical(rest);
  let hash = FNV_OFFSET_64;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    hash = ((hash ^ BigInt(unit >>> 8)) * FNV_PRIME_64) & MASK_64;
    hash = ((hash ^ BigInt(unit & 0xff)) * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}
