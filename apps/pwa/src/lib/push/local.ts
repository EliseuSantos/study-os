import { dueReminders, type DbDriver } from '@studyos/db';

// Session-scoped throttle: each reminder notifies at most once per app open.
const notifiedIds = new Set<string>();

/**
 * Shows a local Notification for each due reminder not yet notified this
 * session. No-op unless permission is already granted (asking is always an
 * explicit user action elsewhere).
 */
export async function maybeNotifyDue(db: DbDriver): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const due = await dueReminders(db, Date.now());
  for (const reminder of due) {
    if (notifiedIds.has(reminder.id)) continue;
    notifiedIds.add(reminder.id);
    try {
      const notification = new Notification(reminder.title, { body: 'lembrete · StudyOS' });
      notification.addEventListener('click', () => window.focus());
    } catch {
      // some platforms only allow notifications via the service worker
    }
  }
}
