<script lang="ts">
  // Searchable select (combobox): type to filter, arrows + enter to pick.
  // Replaces native <select> where the option list grows (e.g. trilhas).
  import NavIcon from '$lib/components/NavIcon.svelte';

  export interface SelectOption {
    value: string;
    label: string;
  }

  let {
    options,
    value = $bindable(''),
    placeholder = 'buscar…',
    id,
    testid,
    ariaLabel,
  }: {
    options: SelectOption[];
    value?: string;
    placeholder?: string;
    id?: string;
    testid?: string;
    ariaLabel?: string;
  } = $props();

  const listId = `select-search-${Math.random().toString(36).slice(2, 8)}`;
  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let root = $state<HTMLDivElement | null>(null);
  let searchEl = $state<HTMLInputElement | null>(null);

  const selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? '');

  function fold(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  const filtered = $derived.by(() => {
    const q = fold(query.trim());
    if (q === '') return options;
    return options.filter((o) => fold(o.label).includes(q));
  });

  function openList(): void {
    open = true;
    query = '';
    active = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    requestAnimationFrame(() => searchEl?.focus());
  }

  function close(): void {
    open = false;
  }

  function pick(option: SelectOption): void {
    value = option.value;
    close();
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = filtered.length === 0 ? 0 : (active + 1) % filtered.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = active <= 0 ? Math.max(0, filtered.length - 1) : active - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[active] ?? filtered[0];
      if (option !== undefined) pick(option);
    }
  }

  function onWindowPointerdown(event: PointerEvent): void {
    if (!open) return;
    if (root !== null && event.target instanceof Node && !root.contains(event.target)) close();
  }
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

<div bind:this={root} class="relative">
  <button
    {id}
    data-testid={testid}
    type="button"
    role="combobox"
    aria-expanded={open}
    aria-controls={listId}
    aria-haspopup="listbox"
    aria-label={ariaLabel}
    onclick={() => (open ? close() : openList())}
    class="type-item flex h-(--h-button-md) w-full cursor-pointer items-center justify-between gap-2 rounded-base border border-border bg-surface px-3 text-left {selectedLabel ===
    ''
      ? 'text-text-low'
      : 'text-text-body'}"
  >
    <span class="min-w-0 truncate">{selectedLabel === '' ? placeholder : selectedLabel}</span>
    <span class="shrink-0 text-text-low" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div
      class="absolute top-full right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-base border border-border bg-bg-deep shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
    >
      <div class="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <NavIcon name="search" size={13} />
        <input
          bind:this={searchEl}
          data-testid={testid ? `${testid}-search` : undefined}
          type="text"
          bind:value={query}
          oninput={() => (active = 0)}
          {onkeydown}
          placeholder="filtrar…"
          autocomplete="off"
          aria-label="filtrar opções"
          class="type-meta min-w-0 flex-1 bg-transparent text-text-body outline-none placeholder:text-text-low"
        />
      </div>
      <ul id={listId} role="listbox" class="max-h-52 overflow-y-auto py-1">
        {#if filtered.length === 0}
          <li class="type-meta px-3 py-2.5 text-text-soft">nada encontrado.</li>
        {:else}
          {#each filtered as option, i (option.value)}
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onclick={() => pick(option)}
                onpointerenter={() => (active = i)}
                class="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors duration-(--dur-base) ease-brand {i ===
                active
                  ? 'bg-(--accent-tint-09) text-text-hi'
                  : 'text-text-body'}"
              >
                <span class="min-w-0 truncate">{option.label}</span>
                {#if option.value === value}
                  <span class="shrink-0 text-accent" aria-hidden="true">✓</span>
                {/if}
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  {/if}
</div>
