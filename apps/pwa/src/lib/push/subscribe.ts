import { dev } from '$app/environment';
import { getOrCreateDeviceId, getSetting } from '@studyos/db';
import { SETTINGS_KEYS } from '@studyos/shared';
import { getDb } from '$lib/db/client';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Same token policy as lib/sync: stored sync token, dev fallback in dev builds.
async function getToken(): Promise<string | null> {
  const db = await getDb();
  const stored = await getSetting(db, SETTINGS_KEYS.syncToken);
  if (stored) return stored;
  return dev ? 'dev-token' : null;
}

/**
 * Full web-push enrollment: fetch the VAPID key, subscribe via the service
 * worker's push manager and register the subscription on the worker. Throws on
 * any failure — callers surface a calm status line.
 */
export async function enablePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('push unsupported');
  }
  const token = await getToken();
  if (!token) throw new Error('sync token missing');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const keyRes = await fetch('/push/vapid', { headers });
  if (!keyRes.ok) throw new Error(`vapid key failed: ${keyRes.status}`);
  const { publicKey } = (await keyRes.json()) as { publicKey: string };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const keys = subscription.toJSON().keys;
  const p256dh = keys?.['p256dh'];
  const auth = keys?.['auth'];
  if (!p256dh || !auth) throw new Error('subscription keys missing');

  const db = await getDb();
  const deviceId = await getOrCreateDeviceId(db);
  const subRes = await fetch('/push/subscribe', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      device_id: deviceId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
    }),
  });
  if (!subRes.ok) throw new Error(`subscribe failed: ${subRes.status}`);
}
