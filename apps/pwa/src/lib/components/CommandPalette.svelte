<script lang="ts">
  // ⌘K command palette: navigation, quick actions and the local FTS search
  // in one keyboard-first overlay.
  import { goto } from '$app/navigation';
  import type { SearchHit } from '@studyos/db';
  import { createSearchStore } from '$lib/stores/search.svelte';
  import NavIcon, { type IconName } from '$lib/components/NavIcon.svelte';

  let { onToggleTheme }: { onToggleTheme: () => void } = $props();

  interface Command {
    label: string;
    hint: string;
    icon: IconName;
    run: () => void;
  }

  const KIND_LABEL: Record<SearchHit['kind'], string> = {
    topic: 'tópico',
    card: 'card',
    content: 'conteúdo',
  };

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  const search = createSearchStore();

  const COMMANDS: Command[] = [
    { label: 'ir para hoje', hint: 'navegar', icon: 'home', run: () => void goto('/') },
    { label: 'ir para trilhas', hint: 'navegar', icon: 'route', run: () => void goto('/tracks') },
    { label: 'ir para agenda', hint: 'navegar', icon: 'calendar', run: () => void goto('/routines') },
    { label: 'estudar agora', hint: 'navegar', icon: 'timer', run: () => void goto('/study') },
    { label: 'revisar cards', hint: 'navegar', icon: 'check', run: () => void goto('/review') },
    { label: 'ir para objetivos', hint: 'navegar', icon: 'target', run: () => void goto('/goals') },
    { label: 'ir para biblioteca', hint: 'navegar', icon: 'book', run: () => void goto('/library') },
    { label: 'criar trilha', hint: 'ação', icon: 'plus', run: () => void goto('/tracks') },
    { label: 'criar objetivo', hint: 'ação', icon: 'plus', run: () => void goto('/goals') },
    { label: 'criar rotina', hint: 'ação', icon: 'plus', run: () => void goto('/routines') },
    { label: 'criar lembrete', hint: 'ação', icon: 'plus', run: () => void goto('/routines') },
    { label: 'ir para ajustes', hint: 'navegar', icon: 'settings', run: () => void goto('/settings') },
    { label: 'alternar tema', hint: 'ação', icon: 'sun', run: () => onToggleTheme() },
  ];

  function fold(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  const commands = $derived.by(() => {
    const q = fold(query.trim());
    if (q === '') return COMMANDS;
    return COMMANDS.filter((c) => fold(c.label).includes(q));
  });

  type Row = { kind: 'cmd'; cmd: Command } | { kind: 'hit'; hit: SearchHit };
  const rows = $derived<Row[]>([
    ...commands.map((cmd) => ({ kind: 'cmd', cmd }) as Row),
    ...(query.trim() === '' ? [] : search.results.map((hit) => ({ kind: 'hit', hit }) as Row)),
  ]);

  function openPalette(): void {
    open = true;
    query = '';
    active = 0;
    search.query = '';
    search.run();
  }

  function close(): void {
    open = false;
    search.close();
  }

  $effect(() => {
    if (open) requestAnimationFrame(() => inputEl?.focus());
  });

  function oninput(event: Event & { currentTarget: HTMLInputElement }): void {
    query = event.currentTarget.value;
    active = 0;
    search.query = query;
    search.run();
  }

  async function activate(row: Row): Promise<void> {
    close();
    if (row.kind === 'cmd') {
      row.cmd.run();
      return;
    }
    const href = await search.resolveHref(row.hit);
    if (href === null) return;
    if (href.startsWith('http')) window.open(href, '_blank', 'noopener,noreferrer');
    else await goto(href);
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (open) close();
      else openPalette();
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = rows.length === 0 ? 0 : (active + 1) % rows.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = active <= 0 ? Math.max(0, rows.length - 1) : active - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[active] ?? rows[0];
      if (row !== undefined) void activate(row);
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="palette-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      data-testid="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="paleta de comandos"
      class="palette rounded-panel border border-border bg-bg-deep"
    >
      <div class="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
        <NavIcon name="search" size={15} />
        <input
          bind:this={inputEl}
          data-testid="command-palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          placeholder="buscar ou digitar um comando…"
          autocomplete="off"
          value={query}
          {oninput}
          class="type-item min-w-0 flex-1 bg-transparent text-text-hi outline-none placeholder:text-text-low"
        />
        <kbd class="type-meta rounded-micro border border-hairline px-1.5 py-0.5 text-text-low">
          esc
        </kbd>
      </div>

      <ul id="palette-list" role="listbox" aria-label="comandos" class="max-h-80 overflow-y-auto py-1.5">
        {#if rows.length === 0}
          <li class="type-item px-4 py-3 text-text-soft">nada encontrado.</li>
        {:else}
          {#each rows as row, i (row.kind === 'cmd' ? `cmd:${row.cmd.label}` : `hit:${row.hit.kind}:${row.hit.ref_id}`)}
            <li role="presentation">
              <button
                data-testid="palette-row"
                type="button"
                role="option"
                aria-selected={i === active}
                onclick={() => void activate(row)}
                onpointerenter={() => (active = i)}
                class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors duration-(--dur-base) ease-brand {i ===
                active
                  ? 'bg-(--accent-tint-09)'
                  : ''}"
              >
                {#if row.kind === 'cmd'}
                  <span class="text-text-low"><NavIcon name={row.cmd.icon} size={14} /></span>
                  <span class="type-item flex-1 text-text-body">{row.cmd.label}</span>
                  <span class="type-meta text-text-low">{row.cmd.hint}</span>
                {:else}
                  <span class="text-text-low"><NavIcon name="search" size={14} /></span>
                  <span class="type-item min-w-0 flex-1 truncate text-text-body">
                    {row.hit.title}
                  </span>
                  <span class="type-meta text-text-low">{KIND_LABEL[row.hit.kind]}</span>
                {/if}
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 12vh 16px 16px;
    background: rgb(0 0 0 / 0.55);
    backdrop-filter: blur(2px);
    animation: palette-fade var(--dur-base) var(--ease-brand);
  }
  .palette {
    width: min(560px, 100%);
    overflow: hidden;
    animation: palette-rise 0.2s var(--ease-brand);
  }
  @keyframes palette-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes palette-rise {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
  }
</style>
