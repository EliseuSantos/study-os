<script lang="ts">
  import NavIcon from '$lib/components/NavIcon.svelte';
  import { untrack } from 'svelte';
  import { getTrack } from '@studyos/db';
  import type { TrackRow } from '@studyos/shared';
  import { renderSVG } from 'uqr';
  import { liveQuery, type LiveQuery } from '$lib/db/live.svelte';
  import { planSnapshotMerge, parseSnapshot } from '@studyos/core';
  import {
    applySnapshotMerge,
    listTopics,
    updateTrack,
    type TrackSnapshotShape,
  } from '@studyos/db';
  import {
    buildTrackSnapshot,
    downloadSnapshot,
    fetchShare,
    publishSnapshot,
    recallShareId,
    rememberShareId,
    republishSnapshot,
  } from '$lib/stores/share.svelte';
  import { getDb } from '$lib/db/client';
  import { showToast } from '$lib/stores/toast.svelte';

  let { trackId }: { trackId: string } = $props();

  let trackLive = $state.raw<LiveQuery<TrackRow | null> | null>(null);
  $effect(() => {
    const lq = liveQuery((db) => getTrack(db, trackId), ['tracks'], null as TrackRow | null);
    untrack(() => {
      trackLive = lq;
    });
    return () => lq.destroy();
  });
  const track = $derived(trackLive?.value ?? null);

  let shareStatus = $state<'idle' | 'working' | 'done' | 'error'>('idle');
  let shareUrl = $state<string | null>(null);
  // publisher memory: this device already published this track under an id
  let ownShareId = $state<string | null>(null);
  $effect(() => {
    const id = trackId;
    void recallShareId(id)
      .then((stored) => {
        // never clobber an id set by a publish that raced this recall
        if (stored !== null) ownShareId = stored;
      })
      .catch(() => {});
  });
  let updating = $state(false);
  let copied = $state(false);
  let updateAvailable = $state(false);

  const qrSvg = $derived(shareUrl !== null ? renderSVG(shareUrl, { border: 2 }) : null);

  // Update detection: tracks imported from a share remember the origin hash;
  // a silent public fetch tells us whether the shared version moved on.
  let checkedOrigin: string | null = null;
  $effect(() => {
    const t = track;
    if (t === null || t.origin === null || !t.origin.startsWith('share:')) return;
    if (t.origin === checkedOrigin) return;
    checkedOrigin = t.origin;
    const expected = t.origin_version;
    void fetchShare(t.origin.slice('share:'.length)).then((res) => {
      if (res !== null && res.hash !== expected) updateAvailable = true;
    });
  });

  async function shareTrack(): Promise<void> {
    shareStatus = 'working';
    copied = false;
    try {
      const snapshot = await buildTrackSnapshot(trackId);
      const existing = ownShareId;
      const { id } =
        existing !== null
          ? await republishSnapshot(existing, snapshot)
          : await publishSnapshot(snapshot);
      if (existing === null) {
        ownShareId = id;
        // memory is best-effort: publishing already succeeded
        rememberShareId(trackId, id).catch(() => {});
      }
      shareUrl = `${location.origin}/import?share=${id}`;
      shareStatus = 'done';
      showToast(
        existing !== null
          ? 'trilha republicada — o mesmo link agora aponta para a versão nova'
          : 'link da trilha pronto para compartilhar',
        'success',
      );
    } catch {
      shareStatus = 'error';
      showToast('não foi possível compartilhar — verifique a conexão.', 'error');
    }
  }

  // student side: pull the republished snapshot and merge it without losing progress
  async function applyUpdate(): Promise<void> {
    const t = track;
    if (t === null || t.origin === null || !t.origin.startsWith('share:') || updating) return;
    updating = true;
    try {
      const res = await fetchShare(t.origin.slice('share:'.length));
      if (res === null) throw new Error('share unavailable');
      const snapshot = parseSnapshot(JSON.stringify(res.snapshot)) as unknown as TrackSnapshotShape;
      const db = await getDb();
      const { getOrCreateDeviceId } = await import('@studyos/db');
      const deviceId = await getOrCreateDeviceId(db);
      const local = await listTopics(db, trackId);
      const plan = planSnapshotMerge(
        local.map((topic) => ({ id: topic.id, title: topic.title, origin_key: topic.origin_key })),
        snapshot.topics,
      );
      const result = await applySnapshotMerge(db, deviceId, trackId, plan, snapshot);
      await updateTrack(db, deviceId, trackId, { origin_version: res.hash });
      updateAvailable = false;
      showToast(
        `trilha atualizada — ${result.added} ${result.added === 1 ? 'tópico novo' : 'tópicos novos'}, seu progresso ficou`,
        'success',
      );
    } catch {
      showToast('não deu para atualizar — tente de novo', 'error');
    } finally {
      updating = false;
    }
  }

  async function exportFile(): Promise<void> {
    try {
      downloadSnapshot(await buildTrackSnapshot(trackId));
    } catch {
      showToast('não deu para exportar — tente de novo', 'error');
    }
  }

  async function copyUrl(): Promise<void> {
    if (shareUrl === null) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      showToast('link copiado', 'success');
    } catch {
      // clipboard unavailable — the readonly input is still selectable
    }
  }
</script>

<section>
  <h2 class="flex items-center gap-1.5 type-label text-text-low">
    <NavIcon name="share" size={12} />
    compartilhar
  </h2>

  {#if updateAvailable}
    <div
      data-testid="origin-update-note"
      class="mt-3 flex flex-wrap items-center gap-3 rounded-base border border-hairline bg-surface-2 px-3 py-2.5"
    >
      <p class="type-item min-w-0 flex-1 text-text-soft">
        há uma versão mais nova desta trilha — atualizar mantém seu progresso.
      </p>
      <button
        data-testid="origin-update-apply"
        type="button"
        disabled={updating}
        onclick={() => void applyUpdate()}
        class="type-meta cursor-pointer rounded-base bg-accent px-3 py-1.5 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:opacity-50"
      >
        {updating ? 'atualizando…' : 'atualizar'}
      </button>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap items-center gap-2">
    <button
      data-testid="share-track"
      type="button"
      disabled={shareStatus === 'working'}
      onclick={() => void shareTrack()}
      class="type-meta cursor-pointer rounded-base border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-default disabled:opacity-60"
    >
      {ownShareId !== null ? 'republicar' : 'compartilhar link'}
    </button>
    <button
      data-testid="export-json"
      type="button"
      onclick={() => void exportFile()}
      class="type-meta cursor-pointer rounded-base border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      exportar arquivo
    </button>
  </div>

  {#if shareUrl !== null}
    <div class="mt-4 flex items-center gap-2">
      <input
        data-testid="share-url"
        type="text"
        readonly
        value={shareUrl}
        aria-label="link de compartilhamento"
        class="type-meta h-8 min-w-0 flex-1 rounded-base border border-border bg-transparent px-3 text-text-body"
      />
      <button
        data-testid="share-copy"
        type="button"
        onclick={() => void copyUrl()}
        class="type-meta cursor-pointer rounded-base border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        {copied ? 'copiado ·' : 'copiar'}
      </button>
    </div>
    {#if qrSvg !== null}
      <div
        data-testid="share-qr"
        role="img"
        aria-label="código qr do link"
        class="qr mt-4 w-[180px] overflow-hidden rounded-base"
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags — svg built locally by uqr -->
        {@html qrSvg}
      </div>
    {/if}
  {/if}
</section>

<style>
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
