<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { getTrack } from '@studyos/db';
  import type { TrackRow } from '@studyos/shared';
  import { renderSVG } from 'uqr';
  import { liveQuery, type LiveQuery } from '$lib/db/live.svelte';
  import {
    buildTrackSnapshot,
    downloadSnapshot,
    fetchShare,
    importSnapshotFile,
    publishSnapshot,
  } from '$lib/stores/share.svelte';

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
  let copied = $state(false);
  let exportError = $state(false);
  let importError = $state<string | null>(null);
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

  async function exportJson(): Promise<void> {
    exportError = false;
    try {
      downloadSnapshot(await buildTrackSnapshot(trackId));
    } catch {
      exportError = true;
    }
  }

  async function shareTrack(): Promise<void> {
    shareStatus = 'working';
    copied = false;
    try {
      const snapshot = await buildTrackSnapshot(trackId);
      const { id } = await publishSnapshot(snapshot);
      shareUrl = `${location.origin}/import?share=${id}`;
      shareStatus = 'done';
    } catch {
      shareStatus = 'error';
    }
  }

  async function copyUrl(): Promise<void> {
    if (shareUrl === null) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
    } catch {
      // clipboard unavailable — the readonly input is still selectable
    }
  }

  async function onImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    importError = null;
    try {
      const newTrackId = await importSnapshotFile(await file.text());
      await goto(`/tracks/${newTrackId}`);
    } catch {
      importError = 'arquivo inválido — confira se é um .studyos.json exportado do StudyOS.';
    } finally {
      input.value = '';
    }
  }
</script>

<section class="mt-12">
  <h2 class="type-label text-text-low">compartilhar</h2>

  {#if updateAvailable}
    <p data-testid="origin-update-note" class="type-item mt-3 text-text-soft">
      há uma versão mais nova desta trilha compartilhada.
    </p>
  {/if}

  <div class="mt-4 flex flex-wrap items-center gap-2">
    <button
      data-testid="export-json"
      type="button"
      onclick={() => void exportJson()}
      class="type-meta cursor-pointer rounded-base border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      exportar .studyos.json
    </button>
    <button
      data-testid="share-track"
      type="button"
      disabled={shareStatus === 'working'}
      onclick={() => void shareTrack()}
      class="type-meta cursor-pointer rounded-base border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-default disabled:opacity-60"
    >
      compartilhar link
    </button>
  </div>

  {#if exportError}
    <p class="type-meta mt-3 text-text-soft">não foi possível exportar.</p>
  {/if}
  {#if shareStatus === 'error'}
    <p class="type-meta mt-3 text-text-soft">
      não foi possível compartilhar — verifique a conexão.
    </p>
  {/if}

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

  <div class="mt-6">
    <label class="flex flex-col items-start gap-2">
      <span class="type-meta text-text-mid">importar .studyos.json</span>
      <input
        data-testid="import-json-input"
        type="file"
        accept=".json,application/json"
        onchange={(event) => void onImportFile(event)}
        class="type-meta cursor-pointer text-text-mid file:mr-3 file:cursor-pointer file:rounded-base file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-text-mid"
      />
    </label>
    {#if importError !== null}
      <p class="type-meta mt-2 text-text-soft">{importError}</p>
    {/if}
  </div>
</section>

<style>
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
