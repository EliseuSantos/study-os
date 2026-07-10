export interface FsrsInput {
  state: 'new' | 'learning' | 'review' | 'relearning';
  stability: number;
  difficulty: number;
  due_at: number | null;
  reps: number;
  lapses: number;
}

export type Rating = 1 | 2 | 3 | 4;

// TODO(M2): implement real FSRS scheduling; placeholder only bumps reps.
export function schedule(input: FsrsInput, _rating: Rating, _now: number): FsrsInput {
  return { ...input, reps: input.reps + 1 };
}
