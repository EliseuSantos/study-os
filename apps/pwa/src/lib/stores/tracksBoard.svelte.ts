import { DAY_MS } from '@studyos/core';
import { listTracks, plannerTopics, sessionSlices, type DbDriver } from '@studyos/db';
import { liveQuery } from '$lib/db/live.svelte';

export interface TrackCard {
  id: string;
  title: string;
  done: number;
  total: number;
  pct: number;
  completed: boolean;
}

export interface TracksBoard {
  resume: (TrackCard & { lastLabel: string }) | null;
  tracks: TrackCard[];
  inProgress: number;
  completed: number;
}

const EMPTY: TracksBoard = { resume: null, tracks: [], inProgress: 0, completed: 0 };

function lastLabel(startedAt: number): string {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (startedAt >= startOfToday) return 'estudada hoje';
  if (startedAt >= startOfToday - DAY_MS) return 'estudada ontem';
  const days = Math.floor((startOfToday - startedAt) / DAY_MS) + 1;
  return `estudada há ${days} dias`;
}

async function load(db: DbDriver): Promise<TracksBoard> {
  const [tracks, topics, sessions] = await Promise.all([
    listTracks(db),
    plannerTopics(db),
    sessionSlices(db, Date.now() - 84 * DAY_MS),
  ]);

  const byTrack = new Map<string, { done: number; total: number }>();
  for (const t of topics) {
    const acc = byTrack.get(t.track_id) ?? { done: 0, total: 0 };
    acc.total += 1;
    if (t.status === 'done') acc.done += 1;
    byTrack.set(t.track_id, acc);
  }

  const cards: TrackCard[] = tracks.map((t) => {
    const acc = byTrack.get(t.id) ?? { done: 0, total: 0 };
    const pct = acc.total === 0 ? 0 : Math.round((acc.done / acc.total) * 100);
    return {
      id: t.id,
      title: t.title,
      done: acc.done,
      total: acc.total,
      pct,
      completed: acc.total > 0 && acc.done === acc.total,
    };
  });

  // most recently studied unfinished track → the resume card
  let resume: TracksBoard['resume'] = null;
  for (const session of [...sessions].sort((a, b) => b.started_at - a.started_at)) {
    if (session.track_id === null) continue;
    const card = cards.find((c) => c.id === session.track_id && !c.completed && c.total > 0);
    if (card) {
      resume = { ...card, lastLabel: lastLabel(session.started_at) };
      break;
    }
  }

  return {
    resume,
    tracks: cards,
    inProgress: cards.filter((c) => c.total > 0 && !c.completed).length,
    completed: cards.filter((c) => c.completed).length,
  };
}

export interface TracksBoardStore {
  get data(): TracksBoard;
  destroy(): void;
}

export function createTracksBoardStore(): TracksBoardStore {
  const live = liveQuery(load, ['tracks', 'topics', 'sessions'], EMPTY);
  return {
    get data() {
      return live.value;
    },
    destroy() {
      live.destroy();
    },
  };
}
