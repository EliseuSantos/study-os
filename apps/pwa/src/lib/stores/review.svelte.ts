import {
  examGoalForTrack,
  getCard,
  getOrCreateDeviceId,
  listDueReviews,
  recordReview,
  trackIdForRef,
  undoLastReview,
  type DueReview,
} from '@studyos/db';
import {
  initialSchedulerState,
  intervalLabel,
  previewIntervals,
  retentionForDate,
  schedule,
  type Rating,
  type SchedulerCardState,
  type SchedulerState,
} from '@studyos/core';
import type { CardSourceRef, FsrsStateRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';

export type { Rating };

export interface ReviewStore {
  get loading(): boolean;
  get current(): DueReview | null;
  get remaining(): number;
  get done(): number;
  get revealed(): boolean;
  get back(): string | null;
  get source(): CardSourceRef | null;
  /** interval label per rating for the current card (e.g. { 1: '10min', … }) */
  get intervals(): Record<Rating, string> | null;
  get canUndo(): boolean;
  load(): Promise<void>;
  reveal(): void;
  rate(rating: Rating): Promise<void>;
  undo(): Promise<void>;
}

function toSchedulerState(row: FsrsStateRow): SchedulerState {
  return {
    state: row.state as SchedulerCardState,
    stability: row.stability,
    difficulty: row.difficulty,
    due_at: row.due_at,
    last_review: row.last_review,
    reps: row.reps,
    lapses: row.lapses,
  };
}

/**
 * Session-stable review queue: loaded once (NOT a liveQuery) because rating
 * mutates fsrs_state and a live list would reshuffle mid-session.
 */
export function createReviewStore(): ReviewStore {
  let items = $state<DueReview[]>([]);
  let index = $state(0);
  let loading = $state(true);
  let revealed = $state(false);
  let back = $state<string | null>(null);
  let source = $state<CardSourceRef | null>(null);
  // exam mode: retention target resolved per item's track (0.9 without a dated goal)
  let retention = $state(0.9);
  let shownAt = 0;
  let rating = false;
  // snapshot for undo: the fsrs row (or null for first review) before the last rating
  let lastRated = $state<{ item: DueReview; prior: DueReview['fsrs'] } | null>(null);
  let backToken = 0;

  async function loadBack(): Promise<void> {
    const token = ++backToken;
    back = null;
    source = null;
    retention = 0.9;
    const item = items[index];
    if (!item) return;
    {
      const db = await getDb();
      const trackId = await trackIdForRef(db, item.refKind, item.refId);
      if (trackId !== null) {
        const exam = await examGoalForTrack(db, trackId, Date.now());
        if (token === backToken) {
          retention = retentionForDate(exam?.target_date ?? null, Date.now());
        }
      }
    }
    if (item.refKind !== 'card') return;
    const db = await getDb();
    const card = await getCard(db, item.refId);
    if (token !== backToken) return;
    back = card?.back_md ?? null;
    if (card?.source_ref != null) {
      try {
        source = JSON.parse(card.source_ref) as CardSourceRef;
      } catch {
        source = null;
      }
    }
  }

  return {
    get loading() {
      return loading;
    },
    get current() {
      return items[index] ?? null;
    },
    get remaining() {
      return Math.max(0, items.length - index);
    },
    get done() {
      return Math.min(index, items.length);
    },
    get revealed() {
      return revealed;
    },
    get back() {
      return back;
    },
    get source() {
      return source;
    },
    get intervals() {
      const item = items[index];
      if (!item) return null;
      const state = item.fsrs ? toSchedulerState(item.fsrs) : initialSchedulerState();
      const ms = previewIntervals(state, Date.now(), retention);
      return {
        1: intervalLabel(ms[1]),
        2: intervalLabel(ms[2]),
        3: intervalLabel(ms[3]),
        4: intervalLabel(ms[4]),
      };
    },
    get canUndo() {
      return lastRated !== null;
    },
    async load() {
      const db = await getDb();
      items = await listDueReviews(db, Date.now());
      index = 0;
      loading = false;
      shownAt = Date.now();
      void loadBack();
    },
    reveal() {
      if (revealed || !items[index]) return;
      revealed = true;
    },
    async rate(value: Rating) {
      const item = items[index];
      if (!item || !revealed || rating) return;
      rating = true;
      try {
        const now = Date.now();
        const state = item.fsrs ? toSchedulerState(item.fsrs) : initialSchedulerState();
        const next = schedule(state, value, now, retention);
        const db = await getDb();
        const deviceId = await getOrCreateDeviceId(db);
        await recordReview(db, deviceId, {
          refKind: item.refKind,
          refId: item.refId,
          next,
          rating: value,
          reviewedAt: now,
          elapsedMs: Math.max(0, now - shownAt),
        });
        lastRated = { item, prior: item.fsrs };
        index += 1;
        revealed = false;
        shownAt = Date.now();
        void loadBack();
      } finally {
        rating = false;
      }
    },
    async undo() {
      const last = lastRated;
      if (!last || rating) return;
      rating = true;
      try {
        const db = await getDb();
        const deviceId = await getOrCreateDeviceId(db);
        await undoLastReview(db, deviceId, last.item.refKind, last.item.refId, last.prior);
        lastRated = null;
        index = Math.max(0, index - 1);
        revealed = false;
        shownAt = Date.now();
        void loadBack();
      } finally {
        rating = false;
      }
    },
  };
}
