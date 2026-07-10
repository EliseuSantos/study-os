// FSRS-5 default parameters (19 weights) from open-spaced-repetition (fsrs4anki v5 / ts-fsrs defaults).
export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const DESIRED_RETENTION = 0.9;
export const DAY_MS = 86_400_000;
export const LEARNING_STEP_MS = 10 * 60 * 1000;
export const MIN_STABILITY = 0.01;
export const MAX_INTERVAL_DAYS = 36_500;
