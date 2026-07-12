<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { fetchShare, importAsTrack, importSnapshotFile } from '$lib/stores/share.svelte';
  import type { ShareGetResult } from '$lib/stores/share.svelte';

  const shareId = $derived(page.url.searchParams.get('share'));

  let status = $state<'idle' | 'loading' | 'ready' | 'importing' | 'error'>('idle');
  let shared = $state<ShareGetResult | null>(null);

  $effect(() => {
    const id = shareId;
    if (id === null || id === '') {
      status = 'idle';
      shared = null;
      return;
    }
    status = 'loading';
    void fetchShare(id).then((res) => {
      if (shareId !== id) return; // the param changed while we were fetching
      if (res === null) {
        status = 'error';
      } else {
        shared = res;
        status = 'ready';
      }
    });
  });

  let importError = $state<string | null>(null);

  async function onImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    importError = null;
    try {
      const trackId = await importSnapshotFile(await file.text());
      await goto(`/tracks/${trackId}`);
    } catch {
      importError = 'arquivo inválido — confira se é um .studyos.json exportado do StudyOS.';
    } finally {
      input.value = '';
    }
  }

  async function confirmImport(): Promise<void> {
    const id = shareId;
    const data = shared;
    if (id === null || data === null || status === 'importing') return;
    status = 'importing';
    try {
      const trackId = await importAsTrack(data.snapshot, {
        origin: `share:${id}`,
        origin_version: data.hash,
      });
      await goto(`/tracks/${trackId}`);
    } catch {
      status = 'error';
    }
  }
</script>

<svelte:head>
  <title>StudyOS — importar</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">importar</p>
  <h1 class="type-h1 mt-2 text-text-hi">trazer uma trilha</h1>

  {#if shareId === null || shareId === ''}
    <p class="type-item mt-6 text-text-soft">
      abra um link de trilha compartilhada (QR ou endereço) ou importe um arquivo
      .studyos.json exportado do StudyOS.
    </p>
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
  {:else if status === 'loading'}
    <p class="type-item mt-6 text-text-soft">carregando…</p>
  {:else if status === 'error'}
    <p class="type-item mt-6 text-text-soft">link inválido ou expirado.</p>
  {:else if shared !== null}
    <div
      data-testid="import-preview"
      class="mt-6 rounded-base border border-hairline bg-surface p-6"
    >
      <p class="type-label text-text-low">trilha compartilhada</p>
      <h2 class="mt-2 font-body text-[19px] leading-[1.35] text-text-hi">
        {shared.snapshot.track.title}
      </h2>
      <p class="type-meta mt-3 text-text-mid tabular-nums">
        {shared.snapshot.topics.length} tópicos · {shared.snapshot.cards.length} cards ·
        {shared.snapshot.lessons.length} aulas
      </p>
      <button
        data-testid="import-confirm"
        type="button"
        disabled={status === 'importing'}
        onclick={() => void confirmImport()}
        class="mt-6 inline-flex h-(--h-button-md) cursor-pointer items-center rounded-base bg-accent px-6 text-[16px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-default disabled:opacity-60"
      >
        importar como trilha
      </button>
    </div>
  {/if}
</section>
