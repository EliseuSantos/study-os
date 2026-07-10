<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { requestPersistence } from '$lib/db/client';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  let theme = $state<'dark' | 'light'>('dark');
  let online = $state(true);

  onMount(() => {
    theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    online = navigator.onLine;
    const update = () => (online = navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    void requestPersistence();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
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

<div class="flex min-h-dvh flex-col">
  <header class="border-b border-hairline">
    <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="text-[15px] font-semibold tracking-tight text-text-hi">StudyOS</span>

      <span class="ml-auto flex items-center gap-4">
        {#if !online}
          <span class="type-meta flex items-center gap-1.5 text-text-low">
            <span class="offline-dot" aria-hidden="true"></span>
            offline
          </span>
        {/if}
        <button
          type="button"
          class="type-meta cursor-pointer rounded-micro border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          aria-pressed={theme === 'light'}
          onclick={toggleTheme}
        >
          {theme === 'light' ? 'tema escuro' : 'tema claro'}
        </button>
      </span>
    </div>
  </header>

  <main class="flex-1">
    {@render children()}
  </main>
</div>

<style>
  .brand-mark {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--accent);
  }

  .offline-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--text-low);
  }
</style>
