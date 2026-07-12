<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import NavIcon, { type IconName } from '$lib/components/NavIcon.svelte';
  import { requestPersistence } from '$lib/db/client';
  import { dbState } from '$lib/stores/db-state.svelte';
  import { createProfileStore } from '$lib/stores/profile.svelte';
  import { initInstall, installState, promptInstall } from '$lib/pwa/install.svelte';
  import { registerServiceWorker } from '$lib/push/register';
  import { startSyncLifecycle, syncState } from '$lib/sync/index.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  interface NavItem {
    href: string;
    label: string;
    icon: IconName;
  }

  const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
      label: 'estudo',
      items: [
        { href: '/', label: 'hoje', icon: 'home' },
        { href: '/tracks', label: 'trilhas', icon: 'route' },
        { href: '/routines', label: 'agenda', icon: 'calendar' },
        { href: '/study', label: 'estudar', icon: 'timer' },
        { href: '/goals', label: 'objetivos', icon: 'target' },
      ],
    },
    {
      label: 'conteúdo',
      items: [{ href: '/library', label: 'biblioteca', icon: 'book' }],
    },
  ];

  const NAV_FLAT: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

  const profile = createProfileStore();

  function isActive(href: string): boolean {
    if (href === '/') return page.url.pathname === '/' || page.url.pathname === '/review';
    return page.url.pathname.startsWith(href);
  }

  let theme = $state<'dark' | 'light'>('dark');
  let online = $state(true);

  const syncLine = $derived.by(() => {
    if (!online) return 'offline · sincroniza quando voltar';
    switch (syncState.status) {
      case 'syncing':
        return 'sincronizando…';
      case 'error':
        return 'não sincronizou — tenta de novo';
      case 'disabled':
        return 'local apenas';
      default:
        return syncState.lastSyncAt === null
          ? 'local primeiro'
          : `sincronizado · ${new Date(syncState.lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  });

  onMount(() => {
    // e2e (and any tooling) can wait for hydration before interacting
    document.documentElement.setAttribute('data-hydrated', '');
    theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    online = navigator.onLine;
    const update = () => (online = navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    void requestPersistence();
    registerServiceWorker();
    initInstall();
    const stopSync = startSyncLifecycle();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      stopSync();
      profile.destroy();
    };
  });

  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      );
  }
</script>

<CommandPalette onToggleTheme={toggleTheme} />
<Toasts />

<div class="min-h-dvh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
  <a href="#conteudo" class="skip-link">pular para o conteúdo</a>

  <!-- sidebar (desktop) -->
  <aside
    data-testid="sidebar"
    class="hidden border-r border-hairline bg-bg-deep lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-1 lg:overflow-y-auto lg:px-3.5 lg:py-5"
  >
    <div class="flex items-center gap-2.5 pb-4">
      <a
        href="/"
        aria-label="ir para o início"
        class="flex items-center gap-2.5 rounded-base px-2.5 py-1 transition-opacity duration-(--dur-base) ease-brand hover:opacity-80"
      >
        <BrandMark size={17} />
        <span class="text-[15px] font-semibold tracking-tight text-text-hi">StudyOS</span>
      </a>
      <button
        type="button"
        class="ml-auto grid h-7 w-7 cursor-pointer place-items-center rounded-base text-text-low transition-colors duration-(--dur-base) ease-brand hover:bg-surface hover:text-text-hi"
        aria-pressed={theme === 'light'}
        aria-label={theme === 'light' ? 'usar tema escuro' : 'usar tema claro'}
        title={theme === 'light' ? 'tema escuro' : 'tema claro'}
        onclick={toggleTheme}
      >
        <NavIcon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
      </button>
    </div>

    <nav data-testid="sidebar-nav" aria-label="principal" class="flex flex-col gap-1">
      {#each NAV_GROUPS as group (group.label)}
        <span class="type-label px-2.5 pt-3 pb-1 text-text-low">{group.label}</span>
        {#each group.items as item (item.href)}
          <a
            href={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
            class="flex items-center gap-2.5 rounded-base border-l-[3px] px-2.5 py-2 text-[13.5px] transition-colors duration-(--dur-base) ease-brand {isActive(
              item.href,
            )
              ? 'border-accent bg-(--accent-tint-09) text-text-hi'
              : 'border-transparent text-text-mid hover:text-text-hi'}"
          >
            <NavIcon name={item.icon} size={15} />
            {item.label}
            {#if item.href === '/' && profile.dueCount > 0}
              <span
                class="ml-auto rounded-chip bg-(--accent-tint-12) px-1.5 py-0.5 text-[10.5px] font-semibold text-accent tabular-nums"
              >
                {profile.dueCount}
              </span>
            {/if}
          </a>
        {/each}
      {/each}
    </nav>

    <div class="flex-1"></div>

    {#if installState.canInstall}
      <button
        data-testid="install-app"
        type="button"
        class="mb-2 cursor-pointer rounded-base px-2.5 py-1.5 text-left text-[12px] text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
        onclick={() => void promptInstall()}
      >
        instalar app
      </button>
    {/if}

    <a
      href="/settings"
      data-testid="open-settings"
      aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}
      class="group -mx-3.5 -mb-5 flex items-center gap-2.5 border-t border-hairline px-4 py-3.5 transition-colors duration-(--dur-base) ease-brand hover:bg-surface"
    >
      <span
        class="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-full border border-border bg-(--accent-tint-12) text-[13px] font-semibold text-accent"
        aria-hidden="true"
      >
        {profile.initial}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[13px] font-medium text-text-body">{profile.name}</span>
        <span class="flex items-center gap-1.5 text-[10.5px] text-text-low">
          {#if online && syncState.status !== 'error'}
            <span class="sync-dot" aria-hidden="true"></span>
          {/if}
          {syncLine}
        </span>
      </span>
      <span
        class="shrink-0 text-text-low transition-colors duration-(--dur-base) ease-brand group-hover:text-text-mid"
        aria-hidden="true"
      >
        <NavIcon name="settings" size={14} />
      </span>
    </a>

  </aside>

  <div class="flex min-w-0 flex-col">
    <!-- top bar (mobile / narrow) -->
    <header class="border-b border-hairline lg:hidden">
      <div class="flex w-full items-center gap-3 overflow-x-auto px-4 py-3">
        <a href="/" aria-label="ir para o início" class="flex shrink-0 items-center gap-3">
          <BrandMark size={17} />
          <span class="text-[15px] font-semibold tracking-tight text-text-hi">StudyOS</span>
        </a>
        <nav class="ml-3 flex items-center gap-3.5" aria-label="principal">
          {#each NAV_FLAT as item (item.href)}
            <a
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              class="type-meta whitespace-nowrap transition-colors duration-(--dur-base) ease-brand {isActive(
                item.href,
              )
                ? 'text-accent'
                : 'text-text-mid hover:text-text-hi'}"
            >
              {item.label}
            </a>
          {/each}
        </nav>
        <span class="ml-auto flex shrink-0 items-center gap-2">
          <a
            href="/settings"
            aria-label="ajustes"
            class="grid h-8 w-8 place-items-center rounded-micro border border-border text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            <NavIcon name="settings" size={15} />
          </a>
          <button
            type="button"
            class="grid h-8 w-8 cursor-pointer place-items-center rounded-micro border border-border text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
            aria-pressed={theme === 'light'}
            aria-label={theme === 'light' ? 'usar tema escuro' : 'usar tema claro'}
            onclick={toggleTheme}
          >
            <NavIcon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
          </button>
        </span>
      </div>
    </header>

    {#if dbState.status === 'unavailable'}
      <div
        data-testid="db-unavailable-note"
        class="mx-4 mt-4 rounded-base border border-border bg-surface px-4 py-3 lg:mx-8"
      >
        <p class="type-item text-text-body">
          {dbState.reason === 'insecure-context'
            ? 'não deu para abrir o banco local — acesse via https para estudar neste dispositivo.'
            : 'não deu para abrir o banco local — recarregue a página ou verifique o navegador.'}
        </p>
      </div>
    {/if}

    <main id="conteudo" class="flex-1">
      {@render children()}
    </main>
  </div>
</div>

<style>
  .skip-link {
    position: absolute;
    left: -9999px;
    top: 12px;
    z-index: 100;
    font: var(--type-meta);
    color: var(--text-hi);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
  }

  .skip-link:focus-visible {
    left: 12px;
  }



  .sync-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
  }

</style>
