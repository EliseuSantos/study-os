<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createTracksStore } from '$lib/stores/tracks.svelte';
  import { createTracksBoardStore } from '$lib/stores/tracksBoard.svelte';
  import { dbState } from '$lib/stores/db-state.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  const store = createTracksStore();
  const board = createTracksBoardStore();
  let title = $state('');

  const data = $derived(board.data);
  const writable = $derived(dbState.status === 'ready');

  onDestroy(() => {
    store.destroy();
    board.destroy();
  });

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!writable) return;
    const value = title;
    title = '';
    void store.add(value);
  }
</script>

<svelte:head>
  <title>StudyOS — trilhas</title>
</svelte:head>

<div class="mx-auto w-full max-w-[1120px] px-4 py-6 lg:px-8 lg:py-7">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <header>
      <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">trilhas</h1>
      <p class="type-meta mt-1 text-text-low tabular-nums">
        {data.inProgress} em andamento · {data.completed}
        {data.completed === 1 ? 'concluída' : 'concluídas'}
      </p>
    </header>

    <form data-testid="track-form" class="flex gap-2" {onsubmit}>
      <label class="sr-only" for="track-title">nova trilha</label>
      <input
        id="track-title"
        data-testid="track-title-input"
        type="text"
        bind:value={title}
        placeholder="ex.: edital TRF · analista judiciário"
        autocomplete="off"
        disabled={!writable}
        class="w-64 min-w-0 rounded-base border border-border bg-surface px-3 py-2 text-[13px] text-text-body placeholder:text-text-low disabled:opacity-50"
      />
      <button
        data-testid="track-submit"
        type="submit"
        disabled={!writable}
        class="flex shrink-0 cursor-pointer items-center gap-2 rounded-base bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <NavIcon name="plus" size={14} />
        criar trilha
      </button>
    </form>
  </div>

  {#if data.resume !== null}
    <a
      href={`/tracks/${data.resume.id}`}
      class="group mt-5 block rounded-panel border border-(--accent-dim)/40 bg-(--accent-tint-09) px-4 py-4 transition-colors duration-(--dur-base) ease-brand hover:bg-(--accent-tint-12) lg:px-5"
    >
      <p class="type-label text-accent">continuar estudando</p>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-3">
        <span class="min-w-0">
          <span class="block truncate font-body text-[16px] font-medium text-text-hi">
            {data.resume.title}
          </span>
          <span class="text-[11.5px] text-text-soft tabular-nums">
            {data.resume.lastLabel} · {data.resume.done} / {data.resume.total} tópicos ·
            {data.resume.pct}%
          </span>
        </span>
        <span
          class="shrink-0 rounded-base bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-ink"
        >
          retomar →
        </span>
      </div>
      <div class="mt-3 h-1 rounded-[2px] bg-(--accent-tint-12)">
        <span class="block h-1 rounded-[2px] bg-accent" style="width:{data.resume.pct}%"></span>
      </div>
    </a>
  {/if}

  <ul data-testid="track-list" class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each data.tracks as track (track.id)}
      <li>
        <a
          data-testid="track-item"
          href={`/tracks/${track.id}`}
          class="group flex h-full flex-col rounded-panel border border-hairline bg-surface px-4 py-3.5 transition-colors duration-(--dur-base) ease-brand hover:border-border"
        >
          <span class="flex items-start justify-between gap-2">
            <span
              class="min-w-0 font-body text-[15px] leading-snug font-medium text-text-body group-hover:text-text-hi"
            >
              {track.title}
            </span>
            {#if track.completed}
              <span class="done-dot shrink-0" title="concluída" aria-label="concluída">✓</span>
            {/if}
          </span>
          <span class="mt-1 text-[11px] text-text-low tabular-nums">
            {track.total === 0
              ? 'sem tópicos ainda'
              : `${track.done} / ${track.total} tópicos · ${track.pct}%`}
          </span>
          <span class="mt-auto pt-3">
            <span class="block h-1 rounded-[2px] bg-hairline">
              <span
                class="block h-1 rounded-[2px] {track.completed ? 'bg-success' : 'bg-accent'}"
                style="width:{track.pct}%"
              ></span>
            </span>
          </span>
        </a>
      </li>
    {/each}
  </ul>

  {#if data.tracks.length === 0}
    <div class="mt-5 rounded-panel border border-hairline bg-surface px-6 py-10 text-center">
      <p class="type-item text-text-soft">nenhuma trilha ainda — crie a primeira.</p>
    </div>
  {/if}
</div>

<style>
  .done-dot {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1.5px solid var(--success);
    color: var(--success);
    font-size: 10px;
  }
</style>
