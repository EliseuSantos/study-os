import { buildSnapshot, parseSnapshot, snapshotHash, type TrackSnapshot } from '@studyos/core';
import { exportTrackData, getOrCreateDeviceId, importSnapshot } from '@studyos/db';
import { getDb } from '$lib/db/client';
import { authedFetch } from './library.svelte';

export interface ShareCreateResult {
  id: string;
  hash: string;
}

export interface ShareGetResult {
  snapshot: TrackSnapshot;
  hash: string;
}

/** `Direito Constitucional — básico` → `direito-constitucional-basico`. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'trilha' : slug;
}

/** Full track rows → portable snapshot (openspec/specs/track-snapshot/spec.md). */
export async function buildTrackSnapshot(trackId: string): Promise<TrackSnapshot> {
  const db = await getDb();
  const data = await exportTrackData(db, trackId);
  const snapshot = buildSnapshot(data);
  // guided review: publish the current-week focus (owner topic ids are the sids)
  const { getTrack } = await import('@studyos/db');
  const { isoWeek } = await import('@studyos/core');
  const track = await getTrack(db, trackId);
  if (
    track !== null &&
    track.focus_week !== null &&
    track.focus_week === isoWeek(Date.now()) &&
    track.focus_topic_ids !== null
  ) {
    try {
      const ids = JSON.parse(track.focus_topic_ids) as string[];
      if (ids.length > 0) snapshot.focus = { week: track.focus_week, topic_ids: ids };
    } catch {
      // malformed focus json: publish without it
    }
  }
  return snapshot;
}

/** Students never receive the presenter's script — published copies drop it. */
function stripPresenterNotes(snapshot: TrackSnapshot): TrackSnapshot {
  return {
    ...snapshot,
    lessons: snapshot.lessons.map((lesson) => ({ ...lesson, presenter_notes_md: null })),
  };
}

/** PUT /share/:id (bearer): republish the same link in place. */
export async function republishSnapshot(
  id: string,
  snapshot: TrackSnapshot,
): Promise<ShareCreateResult> {
  const res = await authedFetch(`/share/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(stripPresenterNotes(snapshot)),
  });
  if (!res.ok) throw new Error(`republish failed: ${res.status}`);
  return (await res.json()) as ShareCreateResult;
}

/** The publisher's device remembers its share id per track (local-only). */
export async function rememberShareId(trackId: string, shareId: string): Promise<void> {
  const { setSettingStmt } = await import('@studyos/db');
  const db = await getDb();
  await db.batch([setSettingStmt(`share_id_${trackId}`, shareId)]);
}

export async function recallShareId(trackId: string): Promise<string | null> {
  const { getSetting } = await import('@studyos/db');
  const db = await getDb();
  return getSetting(db, `share_id_${trackId}`);
}

/** POST /share (bearer) → `{ id, hash }`. Throws on any failure. */
export async function publishSnapshot(snapshot: TrackSnapshot): Promise<ShareCreateResult> {
  const res = await authedFetch('/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(stripPresenterNotes(snapshot)),
  });
  if (!res.ok) throw new Error(`share failed: ${res.status}`);
  const raw = (await res.json()) as { id?: unknown; hash?: unknown };
  if (typeof raw.id !== 'string' || typeof raw.hash !== 'string') {
    throw new Error('share failed: malformed response');
  }
  return { id: raw.id, hash: raw.hash };
}

/** GET /share/:id (public, no bearer). Returns null on any failure. */
export async function fetchShare(id: string): Promise<ShareGetResult | null> {
  try {
    const res = await fetch(`/share/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const raw = (await res.json()) as { snapshot?: unknown; hash?: unknown };
    if (raw.snapshot === undefined || typeof raw.hash !== 'string') return null;
    // Revalidate through core's parser so downstream code gets a checked shape.
    return { snapshot: parseSnapshot(JSON.stringify(raw.snapshot)), hash: raw.hash };
  } catch {
    return null;
  }
}

/** Materialize a snapshot as a new local track; returns the new track id. */
export function downloadSnapshot(snapshot: TrackSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(snapshot.track.title)}.studyos.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importAsTrack(
  snapshot: TrackSnapshot,
  origin: { origin: string; origin_version: string },
): Promise<string> {
  const db = await getDb();
  const deviceId = await getOrCreateDeviceId(db);
  return importSnapshot(db, deviceId, snapshot, origin);
}

/** Import a .studyos.json file's content as a new local track. */
export async function importSnapshotFile(json: string): Promise<string> {
  const snapshot = parseSnapshot(json);
  return importAsTrack(snapshot, { origin: 'file', origin_version: snapshotHash(snapshot) });
}
