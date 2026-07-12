<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import type { SearchHit } from '@studyos/db';
  import { createSearchStore } from '$lib/stores/search.svelte';

  const store = createSearchStore();
  let activeIndex = $state(-1);
  let blurTimer: ReturnType<typeof setTimeout> | null = null;

  const KIND_LABEL: Record<SearchHit['kind'], string> = {
    topic: 'tópico',
    card: 'card',
    content: 'conteúdo',
  };

  // The fts snippet marks matches with [ ]; render plain text.
  function stripMarkers(snippet: string): string {
    return snippet.replaceAll('[', '').replaceAll(']', '');
  }

  function clear(): void {
    store.close();
    store.query = '';
    store.run();
    activeIndex = -1;
  }

  async function activate(hit: SearchHit): Promise<void> {
    const href = await store.resolveHref(hit);
    clear();
    if (href === null) return;
    if (href.startsWith('http')) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      await goto(href);
    }
  }

  function oninput(event: Event & { currentTarget: HTMLInputElement }): void {
    store.query = event.currentTarget.value;
    activeIndex = -1;
    store.run();
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      store.close();
      activeIndex = -1;
      return;
    }
    if (!store.open || store.results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % store.results.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = activeIndex <= 0 ? store.results.length - 1 : activeIndex - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = store.results[activeIndex] ?? store.results[0];
      if (hit !== undefined) void activate(hit);
    }
  }

  function onblur(): void {
    // Delay so a click on a result lands before the dropdown closes.
    blurTimer = setTimeout(() => {
      blurTimer = null;
      store.close();
      activeIndex = -1;
    }, 150);
  }

  function onfocus(): void {
    if (blurTimer !== null) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    if (store.query.trim() !== '') store.run();
  }

  onDestroy(() => {
    if (blurTimer !== null) clearTimeout(blurTimer);
  });

</script>

<div class="relative">
  <label class="sr-only" for="global-search-input">buscar</label>
  <input
    id="global-search-input"
    data-testid="global-search-input"
    type="text"
    role="combobox"
    aria-expanded={store.open}
    aria-controls="global-search-results"
    aria-autocomplete="list"
    aria-activedescendant={activeIndex >= 0 ? `global-search-option-${activeIndex}` : undefined}
    placeholder="buscar · ⌘K"
    autocomplete="off"
    value={store.query}
    {oninput}
    {onkeydown}
    {onblur}
    {onfocus}
    class="type-meta h-8 w-44 rounded-micro border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
  />

  {#if store.open}
    <ul
      id="global-search-results"
      data-testid="global-search-results"
      role="listbox"
      aria-label="resultados da busca"
      class="absolute top-full right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-base border border-hairline bg-surface"
    >
      {#if store.results.length === 0}
        <li class="type-meta px-3 py-2.5 text-text-soft">nada encontrado</li>
      {:else}
        {#each store.results as hit, i (`${hit.kind}:${hit.ref_id}`)}
          {@const snippet = stripMarkers(hit.snippet)}
          <li role="presentation" class="border-b border-hairline last:border-b-0">
            <button
              id={`global-search-option-${i}`}
              data-testid="global-search-result"
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onclick={() => void activate(hit)}
              class="flex w-full cursor-pointer items-baseline gap-2 px-3 py-2.5 text-left transition-colors duration-(--dur-base) ease-brand {i ===
              activeIndex
                ? 'bg-surface-2'
                : 'hover:bg-surface-2'}"
            >
              <span class="type-meta shrink-0 text-text-low">{KIND_LABEL[hit.kind]}</span>
              <span class="min-w-0 flex-1">
                <span class="type-item block truncate text-text-body">{hit.title}</span>
                {#if snippet !== ''}
                  <span class="type-meta block truncate text-text-soft">{snippet}</span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
