import { listDueReviews, type DueReview } from '@studyos/db';
import { liveQuery } from '$lib/db/live.svelte';

export interface QueueStore {
  get items(): DueReview[];
  destroy(): void;
}

/** Live Today queue — refreshes whenever reviews, cards or topics change. */
export function createQueueStore(): QueueStore {
  const live = liveQuery(
    (db) => listDueReviews(db, Date.now()),
    ['fsrs_state', 'cards', 'topics'],
    [] as DueReview[],
  );

  return {
    get items() {
      return live.value;
    },
    destroy() {
      live.destroy();
    },
  };
}
