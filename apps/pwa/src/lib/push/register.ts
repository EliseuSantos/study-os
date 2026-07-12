import { browser, dev } from '$app/environment';

/** Registers the static service worker (push notifications). Best-effort: the app works without it. */
export function registerServiceWorker(): void {
  if (!browser || !('serviceWorker' in navigator)) return;
  try {
    if (dev) {
      // hot-reload sessions must not fight a previously installed production
      // worker and its caches — drop any registration on this origin
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {});
      return;
    }
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // registration failures (private mode, unsupported) are non-fatal
    });
  } catch {
    // same: never let SW registration break app boot
  }
}
