import {
  createReminder,
  deleteReminder,
  getOrCreateDeviceId,
  listReminders,
  updateReminder,
} from '@studyos/db';
import type { ReminderRow } from '@studyos/shared';
import { browser } from '$app/environment';
import { getDb } from '$lib/db/client';
import { liveQuery } from '$lib/db/live.svelte';
import { maybeNotifyDue } from '$lib/push/local';

export interface RemindersStore {
  get reminders(): ReminderRow[];
  add(title: string, notifyAt: number): Promise<void>;
  update(id: string, title: string, notifyAt: number): Promise<void>;
  remove(id: string): Promise<void>;
  destroy(): void;
}

export function createRemindersStore(): RemindersStore {
  const live = liveQuery((db) => listReminders(db), ['reminders'], [] as ReminderRow[]);
  if (browser) {
    void getDb()
      .then((db) => maybeNotifyDue(db))
      .catch(() => {});
  }
  return {
    get reminders() {
      return live.value;
    },
    async add(title: string, notifyAt: number) {
      const trimmed = title.trim();
      if (!trimmed || !Number.isFinite(notifyAt)) return;
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createReminder(db, deviceId, { title: trimmed, notify_at: notifyAt });
      await live.refresh();
    },
    async update(id: string, title: string, notifyAt: number) {
      const trimmed = title.trim();
      if (!trimmed || !Number.isFinite(notifyAt)) return;
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await updateReminder(db, deviceId, id, { title: trimmed, notify_at: notifyAt });
      await live.refresh();
    },
    async remove(id: string) {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await deleteReminder(db, deviceId, id);
      await live.refresh();
    },
    destroy() {
      live.destroy();
    },
  };
}
