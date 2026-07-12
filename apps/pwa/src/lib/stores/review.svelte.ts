import {
  getCard,
  getOrCreateDeviceId,
  listDueReviews,
  recordReview,
  type DueReview,
} from '@studyos/db';
import {
  initialSchedulerState,
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
  load(): Promise<void>;
  reveal(): void;
  rate(rating: Rating): Promise<void>;
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
  let shownAt = 0;
  let rating = false;
  let backToken = 0;

  async function loadBack(): Promise<void> {
    const token = ++backToken;
    back = null;
    source = null;
    const item = items[index];
    if (!item || item.refKind !== 'card') return;
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
        const next = schedule(state, value, now);
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
        index += 1;
        revealed = false;
        shownAt = Date.now();
        void loadBack();
      } finally {
        rating = false;
      }
    },
  };
}
