import { browser } from '$app/environment';

/** Registers the static service worker (push notifications). Best-effort: the app works without it. */
export function registerServiceWorker(): void {
  if (!browser || !('serviceWorker' in navigator)) return;
  try {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // registration failures (private mode, unsupported) are non-fatal
    });
  } catch {
    // same: never let SW registration break app boot
  }
}
