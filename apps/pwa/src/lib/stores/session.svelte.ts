import { finishSession, getOrCreateDeviceId, startSession } from '@studyos/db';
import { getDb } from '$lib/db/client';

export type SessionType = 'theory' | 'questions' | 'review' | 'reading';
export type TimerPhase = 'idle' | 'running' | 'paused' | 'logging';

export interface SessionDetails {
  questionsTotal: number | null;
  questionsCorrect: number | null;
  notes: string | null;
}

export interface SessionStore {
  get phase(): TimerPhase;
  get type(): SessionType;
  set type(value: SessionType);
  get netSeconds(): number;
  get sessionId(): string | null;
  get summary(): string | null;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  finish(): void;
  save(details: SessionDetails): Promise<void>;
  destroy(): void;
}

function summaryLine(netSeconds: number): string {
  const minutes = Math.round(netSeconds / 60);
  const amount = minutes >= 1 ? `${minutes} min líquidos` : 'menos de 1 min';
  return `sessão registrada · ${amount}`;
}

/**
 * Net-hours focus timer: seconds accumulate only while running (pauses are
 * excluded) and nothing is persisted between start and finish/save.
 */
export function createSessionStore(): SessionStore {
  let phase = $state<TimerPhase>('idle');
  let type = $state<SessionType>('theory');
  let netSeconds = $state(0);
  let sessionId = $state<string | null>(null);
  let summary = $state<string | null>(null);
  let ticker: ReturnType<typeof setInterval> | null = null;
  let starting = false;
  let saving = false;

  function startTicking(): void {
    ticker ??= setInterval(() => {
      netSeconds += 1;
    }, 1000);
  }

  function stopTicking(): void {
    if (ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  return {
    get phase() {
      return phase;
    },
    get type() {
      return type;
    },
    set type(value: SessionType) {
      type = value;
    },
    get netSeconds() {
      return netSeconds;
    },
    get sessionId() {
      return sessionId;
    },
    get summary() {
      return summary;
    },
    async start() {
      if (phase !== 'idle' || starting) return;
      starting = true;
      try {
        const db = await getDb();
        const deviceId = await getOrCreateDeviceId(db);
        const session = await startSession(db, deviceId, { type });
        sessionId = session.id;
        summary = null;
        netSeconds = 0;
        phase = 'running';
        startTicking();
      } catch {
        // db unavailable — the shell banner explains it
      } finally {
        starting = false;
      }
    },
    pause() {
      if (phase !== 'running') return;
      stopTicking();
      phase = 'paused';
    },
    resume() {
      if (phase !== 'paused') return;
      phase = 'running';
      startTicking();
    },
    finish() {
      if (phase !== 'running' && phase !== 'paused') return;
      stopTicking();
      phase = 'logging';
    },
    async save(details: SessionDetails) {
      if (phase !== 'logging' || sessionId === null || saving) return;
      saving = true;
      try {
        const db = await getDb();
        const deviceId = await getOrCreateDeviceId(db);
        await finishSession(db, deviceId, sessionId, {
          ended_at: Date.now(),
          net_seconds: netSeconds,
          focused: 1,
          questions_total: details.questionsTotal,
          questions_correct: details.questionsCorrect,
          notes: details.notes,
        });
        summary = summaryLine(netSeconds);
        sessionId = null;
        netSeconds = 0;
        phase = 'idle';
      } catch {
        // db unavailable — the shell banner explains it
      } finally {
        saving = false;
      }
    },
    destroy() {
      stopTicking();
    },
  };
}
