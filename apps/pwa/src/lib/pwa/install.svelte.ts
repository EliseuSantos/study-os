import { browser } from '$app/environment';

/** Non-standard Chromium event; not in the TS DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const installState = $state({ canInstall: false, installed: false });

let deferred: BeforeInstallPromptEvent | null = null;
let initialized = false;

/** Idempotent; call once from the root layout. No-op outside the browser. */
export function initInstall(): void {
  if (!browser || initialized) return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    installState.canInstall = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installState.canInstall = false;
    installState.installed = true;
  });
}

/** Shows the stashed native install prompt. No-op when nothing is stashed. */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  await event.prompt();
  await event.userChoice;
  deferred = null;
  installState.canInstall = false;
}
