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

  const store = createLibraryStore();
  let query = $state('');
  // Only one attach picker open at a time; keyed by source:external_id.
  let openPickerKey = $state<string | null>(null);
  let attached = $state<Record<string, string>>({});

  onDestroy(() => store.destroy());

  const FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'todas' },
    { value: 'youtube', label: 'youtube' },
    { value: 'wikipedia', label: 'wikipédia' },
    { value: 'stackexchange', label: 'stack exchange' },
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
  const visibleGroups = $derived(
    store.groups.filter(
      (g) => g.results.length > 0 || (g.source === 'youtube' && store.youtubeUnavailable),
    ),
  );
</script>

<svelte:head>
  <title>StudyOS — biblioteca</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">conteúdo</p>
  <h1 class="type-h1 mt-2 text-text-hi">biblioteca</h1>

  <form data-testid="library-search-form" class="mt-8" {onsubmit}>
    <label class="type-label block text-text-low" for="library-query">buscar conteúdo</label>
    <div class="mt-3 flex gap-2">
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
        class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        buscar
      </button>
    </div>
  </form>

  <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="filtrar por fonte">
    {#each FILTERS as option (option.value)}
      <button
        data-testid={`library-filter-${option.value}`}
        type="button"
        aria-pressed={store.filter === option.value}
        onclick={() => store.setFilter(option.value)}
        class="type-meta h-(--h-button-md) cursor-pointer rounded-chip border px-3 transition-colors duration-(--dur-base) ease-brand {store.filter ===
        option.value
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-border text-text-mid hover:text-text-hi'}"
      >
        {option.label}
      </button>
    {/each}
  </div>

  <div aria-live="polite">
    {#if store.status === 'idle'}
      <p class="type-item mt-8 text-text-soft">busque um assunto — vídeo, artigo ou pergunta.</p>
    {:else if store.status === 'loading'}
      <p class="type-item mt-8 text-text-soft">buscando…</p>
    {:else if total === 0 && !store.youtubeUnavailable}
      <p class="type-item mt-8 text-text-soft">nada encontrado — tente outros termos.</p>
    {/if}
  </div>

  {#if store.status === 'done' && visibleGroups.length > 0}
    <div data-testid="library-results" class="mt-8">
      {#each visibleGroups as group (group.source)}
        <section class="mt-6 first:mt-0">
          <h2 class="type-label text-text-low">{SOURCE_LABELS[group.source]}</h2>
          {#if group.source === 'youtube' && store.youtubeUnavailable}
            <p class="type-item mt-2 text-text-soft">busca do youtube não configurada.</p>
          {/if}
          <ul role="list" class="mt-2">
            {#each group.results as result (keyOf(result))}
              <li data-testid="library-result" class="border-b border-hairline py-3 first:border-t">
                {#if result.source === 'youtube'}
                  <a
                    href={`/library/watch/${result.external_id}`}
                    class="type-item block text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                  >
                    {result.title}
                  </a>
                {:else}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener"
                    class="type-item block text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                  >
                    {result.title}
                  </a>
                {/if}
                <p class="type-meta mt-1 text-text-low">
                  {KIND_LABELS[result.kind] ?? result.kind} · {SOURCE_LABELS[group.source]}
                </p>
                {#if result.description !== null && result.description !== ''}
                  <p class="type-meta mt-1 line-clamp-2 text-text-soft">{result.description}</p>
                {/if}

                {#if attached[keyOf(result)] !== undefined}
                  <p class="type-meta mt-2 text-text-mid">anexado · {attached[keyOf(result)]}</p>
                {:else}
                  <button
                    data-testid="library-attach"
                    type="button"
                    aria-expanded={openPickerKey === keyOf(result)}
                    onclick={() => togglePicker(result)}
                    class="type-meta mt-2 cursor-pointer text-text-mid underline decoration-hairline underline-offset-4 transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
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
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</section>
