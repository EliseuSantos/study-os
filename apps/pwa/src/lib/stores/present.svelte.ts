import { getContent, getLesson, getTopic, listLessonItems } from '@studyos/db';
import type { ContentItemRow, LessonItemRow, LessonRow, TopicRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';

export type PresentStatus = 'loading' | 'ready' | 'notfound';

export interface QuizData {
  q: string;
  options: string[];
  /** 0-based index into options. */
  answer: number;
}

/** Defensive parse of quiz body_md JSON; null means "render as note". */
export function parseQuiz(body: string | null): QuizData | null {
  if (body === null) return null;
  try {
    const raw: unknown = JSON.parse(body);
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r['q'] !== 'string') return null;
    const options = r['options'];
    if (!Array.isArray(options) || !options.every((o): o is string => typeof o === 'string')) {
      return null;
    }
    const answer = r['answer'];
    if (typeof answer !== 'number' || !Number.isInteger(answer)) return null;
    if (answer < 0 || answer >= options.length) return null;
    return { q: r['q'], options, answer };
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export interface PresentStore {
  get status(): PresentStatus;
  get lesson(): LessonRow | null;
  get items(): LessonItemRow[];
  get topics(): ReadonlyMap<string, TopicRow>;
  get content(): ReadonlyMap<string, ContentItemRow>;
  get presenting(): boolean;
  get index(): number;
  get presenterMode(): boolean;
  /** Seconds since the presentation started. */
  get elapsed(): number;
  /** item id → picked option index (quiz slides). */
  get picks(): Readonly<Record<string, number>>;
  load(): Promise<void>;
  start(): void;
  exit(): void;
  next(): void;
  prev(): void;
  togglePresenter(): void;
  pick(itemId: string, option: number): void;
  destroy(): void;
}

/** Loads a lesson once (presentations are not live) and drives slide state. */
export function createPresentStore(lessonId: string): PresentStore {
  let status = $state<PresentStatus>('loading');
  let lesson = $state<LessonRow | null>(null);
  let items = $state<LessonItemRow[]>([]);
  let topics = $state<Map<string, TopicRow>>(new Map());
  let content = $state<Map<string, ContentItemRow>>(new Map());

  let presenting = $state(false);
  let index = $state(0);
  let presenterMode = $state(false);
  let elapsed = $state(0);
  let picks = $state<Record<string, number>>({});
  let ticker: ReturnType<typeof setInterval> | null = null;

  function stopTicker(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  }

  async function load(): Promise<void> {
    const db = await getDb();
    const found = await getLesson(db, lessonId);
    if (found === null || found.deleted_at !== null) {
      status = 'notfound';
      return;
    }
    const lessonItems = await listLessonItems(db, lessonId);

    const topicIds = [...new Set(lessonItems.flatMap((i) => (i.topic_id ? [i.topic_id] : [])))];
    const contentIds = [
      ...new Set(lessonItems.flatMap((i) => (i.content_item_id ? [i.content_item_id] : []))),
    ];
    const [topicRows, contentRows] = await Promise.all([
      Promise.all(topicIds.map((id) => getTopic(db, id))),
      Promise.all(contentIds.map((id) => getContent(db, id))),
    ]);

    topics = new Map(topicRows.flatMap((t) => (t ? [[t.id, t] as const] : [])));
    content = new Map(contentRows.flatMap((c) => (c ? [[c.id, c] as const] : [])));
    lesson = found;
    items = lessonItems;
    status = 'ready';
  }

  return {
    get status() {
      return status;
    },
    get lesson() {
      return lesson;
    },
    get items() {
      return items;
    },
    get topics() {
      return topics;
    },
    get content() {
      return content;
    },
    get presenting() {
      return presenting;
    },
    get index() {
      return index;
    },
    get presenterMode() {
      return presenterMode;
    },
    get elapsed() {
      return elapsed;
    },
    get picks() {
      return picks;
    },
    load,
    start() {
      if (status !== 'ready' || items.length === 0) return;
      index = 0;
      picks = {};
      elapsed = 0;
      presenting = true;
      const startedAt = Date.now();
      stopTicker();
      ticker = setInterval(() => {
        elapsed = Math.floor((Date.now() - startedAt) / 1000);
      }, 1000);
    },
    exit() {
      presenting = false;
      presenterMode = false;
      stopTicker();
    },
    next() {
      if (index < items.length - 1) index += 1;
    },
    prev() {
      if (index > 0) index -= 1;
    },
    togglePresenter() {
      presenterMode = !presenterMode;
    },
    pick(itemId: string, option: number) {
      // First pick locks in — reveals the answer, no re-tries.
      if (itemId in picks) return;
      picks = { ...picks, [itemId]: option };
    },
    destroy() {
      stopTicker();
    },
  };
}
