<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ContentResult } from '@studyos/connectors';
  import type { TopicRow } from '@studyos/shared';
  import {
    createLibraryStore,
    KIND_LABELS,
    SOURCE_LABELS,
    type SourceFilter,
  } from '$lib/stores/library.svelte';
  import AttachPicker from './AttachPicker.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  const store = createLibraryStore();
  let query = $state('');
  // Only one attach picker open at a time; keyed by source:external_id.
  let openPickerKey = $state<string | null>(null);
  let attached = $state<Record<string, string>>({});

  onDestroy(() => store.destroy());

  const FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'todas' },
    { value: 'web', label: 'web' },
    { value: 'youtube', label: 'youtube' },
  ];

  function keyOf(result: ContentResult): string {
    return `${result.source}:${result.external_id}`;
  }

  function onsubmit(event: SubmitEvent): void {
    event.preventDefault();
    openPickerKey = null;
    void store.search(query);
  }

  function togglePicker(result: ContentResult): void {
    const key = keyOf(result);
    openPickerKey = openPickerKey === key ? null : key;
  }

  async function confirmAttach(result: ContentResult, topic: TopicRow): Promise<void> {
    await store.attach(result, topic.id);
    attached = { ...attached, [keyOf(result)]: topic.title };
    openPickerKey = null;
  }

  const total = $derived(store.groups.reduce((n, g) => n + g.results.length, 0));
  const webNoteVisible = $derived(store.webUnavailable || store.webOverBudget);
  const visibleGroups = $derived(
    store.groups.filter(
      (g) =>
        g.results.length > 0 ||
        (g.source === 'youtube' && store.youtubeUnavailable) ||
        (g.source === 'web' && webNoteVisible),
    ),
  );
</script>

<svelte:head>
  <title>StudyOS — biblioteca</title>
</svelte:head>

<div class="mx-auto w-full max-w-[1120px] px-4 py-6 lg:px-8 lg:py-7">
  <header>
    <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">biblioteca</h1>
    <p class="type-meta mt-1 text-text-low">vídeos, artigos e perguntas para anexar aos tópicos</p>
  </header>

  <div class="mt-5 rounded-panel border border-hairline bg-surface px-4 py-4 lg:px-5">
    <form data-testid="library-search-form" {onsubmit}>
      <label class="sr-only" for="library-query">buscar conteúdo</label>
      <div class="flex gap-2">
        <input
          id="library-query"
          data-testid="library-search-input"
          type="search"
          bind:value={query}
          placeholder="ex.: princípios da administração pública"
          autocomplete="off"
          class="type-item h-(--h-button-md) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
        />
        <button
          data-testid="library-search-submit"
          type="submit"
          class="flex h-(--h-button-md) shrink-0 cursor-pointer items-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
        >
          <NavIcon name="search" size={14} />
          buscar
        </button>
      </div>
    </form>

    <div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="filtrar por fonte">
      {#each FILTERS as option (option.value)}
        <button
          data-testid={`library-filter-${option.value}`}
          type="button"
          aria-pressed={store.filter === option.value}
          onclick={() => store.setFilter(option.value)}
          class="type-meta h-(--h-button-sm) cursor-pointer rounded-chip border px-3 transition-colors duration-(--dur-base) ease-brand {store.filter ===
          option.value
            ? 'border-accent bg-accent text-accent-ink'
            : 'border-border text-text-mid hover:text-text-hi'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  <div aria-live="polite">
    {#if store.status === 'idle'}
      <p class="type-item mt-6 text-text-soft">busque um assunto — vídeo, artigo ou pergunta.</p>
    {:else if store.status === 'loading'}
      <p class="type-item mt-6 text-text-soft">buscando…</p>
    {:else if total === 0 && !store.youtubeUnavailable && !webNoteVisible}
      <p class="type-item mt-6 text-text-soft">nada encontrado — tente outros termos.</p>
    {/if}
  </div>

  {#if store.status === 'done' && visibleGroups.length > 0}
    <div data-testid="library-results" class="mt-6">
      {#each visibleGroups as group (group.source)}
        <section class="mt-6 first:mt-0">
          <h2 class="type-label text-text-low">
            {SOURCE_LABELS[group.source]}{group.results.length > 0
              ? ` · ${group.results.length}`
              : ''}
          </h2>
          {#if group.source === 'youtube' && store.youtubeUnavailable}
            <p class="type-item mt-2 text-text-soft">busca do youtube não configurada.</p>
          {/if}
          {#if group.source === 'web' && store.webUnavailable}
            <p class="type-item mt-2 text-text-soft">busca na web não configurada.</p>
          {/if}
          {#if group.source === 'web' && store.webOverBudget}
            <p data-testid="web-over-budget" class="type-item mt-2 text-text-soft">
              limite mensal de busca atingido — renova no próximo mês.
            </p>
          {/if}
          <ul role="list" class="mt-3 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each group.results as result (keyOf(result))}
              <li
                data-testid="library-result"
                class="flex h-full min-w-0 flex-col rounded-panel border border-hairline bg-surface p-3.5 transition-colors duration-(--dur-base) ease-brand hover:border-border"
              >
                {#if result.source === 'youtube'}
                  <a href={`/library/watch/${result.external_id}`} class="media" aria-hidden="true" tabindex="-1">
                    <span class="play"></span>
                  </a>
                  <a
                    href={`/library/watch/${result.external_id}`}
                    class="type-item mt-3 block font-medium text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                  >
                    {result.title}
                  </a>
                {:else if result.source === 'web'}
                  <a
                    href={`/library/read?url=${encodeURIComponent(result.url)}`}
                    class="type-item block font-medium text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                  >
                    {result.title}
                  </a>
                {:else}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener"
                    class="type-item block font-medium text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                  >
                    {result.title}
                  </a>
                {/if}
                <p class="type-meta mt-1 text-text-low">
                  {KIND_LABELS[result.kind] ?? result.kind} · {SOURCE_LABELS[group.source]}
                </p>
                {#if result.description !== null && result.description !== ''}
                  <p class="type-meta mt-1.5 line-clamp-2 text-text-soft">{result.description}</p>
                {/if}

                <div class="mt-auto pt-3">
                  {#if attached[keyOf(result)] !== undefined}
                    <p class="type-meta text-success">✓ anexado · {attached[keyOf(result)]}</p>
                  {:else}
                    <button
                      data-testid="library-attach"
                      type="button"
                      aria-expanded={openPickerKey === keyOf(result)}
                      onclick={() => togglePicker(result)}
                      class="type-meta cursor-pointer text-text-mid underline decoration-hairline underline-offset-4 transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                    >
                      anexar a um tópico
                    </button>
                  {/if}

                  {#if openPickerKey === keyOf(result)}
                    <AttachPicker
                      tracks={store.tracks}
                      loadTopics={(trackId) => store.loadTopics(trackId)}
                      onconfirm={(topic) => void confirmAttach(result, topic)}
                    />
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Video thumb stand-in: brand diagonal stripes + a play triangle.
     No remote thumbnails — the library stays fully offline-friendly. */
  .media {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 7;
    border-radius: var(--radius-base);
    background: repeating-linear-gradient(
      135deg,
      var(--accent-tint-09) 0 10px,
      transparent 10px 20px
    );
    border: 1px solid var(--hairline);
  }
  .play {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accent);
    position: relative;
  }
  .play::after {
    content: '';
    position: absolute;
    left: 13px;
    top: 10px;
    border-left: 11px solid var(--accent-ink);
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
  }
</style>
