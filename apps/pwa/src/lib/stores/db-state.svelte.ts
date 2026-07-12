import { browser } from '$app/environment';

export type DbStatus = 'starting' | 'ready' | 'unavailable';

export const dbState = $state({
  status: 'starting' as DbStatus,
  reason: null as 'insecure-context' | 'unknown' | null,
});

export function markDbReady(): void {
  dbState.status = 'ready';
  dbState.reason = null;
}

export function markDbUnavailable(): void {
  dbState.status = 'unavailable';
  dbState.reason = browser && !window.isSecureContext ? 'insecure-context' : 'unknown';
}
