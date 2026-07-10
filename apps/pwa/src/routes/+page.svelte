<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createGoalsStore } from '$lib/stores/goals.svelte';
  import { createTodayStore } from '$lib/stores/today.svelte';
  import { requestSync, syncState } from '$lib/sync/index.svelte';

  const store = createGoalsStore();
  const today = createTodayStore();
  let title = $state('');

  const itemCount = $derived(today.items.length);
  const reviewCount = $derived(today.items.filter((i) => i.kind === 'review').length);
  const hasBlocks = $derived(today.items.some((i) => i.kind === 'block'));

  const syncLabel = $derived.by(() => {
    switch (syncState.status) {
      case 'syncing':
        return 'sincronizando…';
      case 'error':
        return 'não sincronizou — tenta de novo sozinho';
      case 'offline':
        return 'offline · sincroniza quando voltar';
      case 'disabled':
        return 'local apenas · sync não configurado';
      default:
        return 'local primeiro · sincroniza quando online';
    }
  });

  onDestroy(() => {
    store.destroy();
    today.destroy();
  });

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    const value = title;
    title = '';
    void store.add(value);
  }

  function syncNow() {
    void requestSync();
  }
</script>

<svelte:head>
  <title>StudyOS — hoje</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 pt-8">
  <p class="type-label text-text-low">
    fila de hoje · {itemCount}
    {itemCount === 1 ? 'item' : 'itens'}
  </p>
  <h1 class="type-h1 mt-2 text-text-hi">fila de hoje</h1>

  {#if today.replanNote}
    <p data-testid="replan-note" class="type-meta mt-3 text-text-low">
      ontem ficou pendente — redistribuído.
    </p>
  {/if}

  {#if today.targets.length > 0}
    <div class="mt-6">
      {#each today.targets as target (target.id)}
        <div data-testid="target-progress" class="py-2">
          <div class="h-1 overflow-hidden rounded-full bg-hairline">
            <div class="h-1 rounded-full bg-accent" style="width: {target.pct}%"></div>
          </div>
          <p class="type-meta mt-1.5 text-text-low">{target.label}</p>
        </div>
      {/each}
    </div>
  {/if}

  <ul data-testid="today-queue" class="mt-6">
    {#each today.items as item (item.kind + item.sort + item.title)}
      <li
        data-testid="today-item"
        data-kind={item.kind}
        class="flex items-baseline justify-between gap-3 border-b border-hairline py-3 first:border-t"
      >
        <span class="type-item min-w-0 flex-1 text-text-body">{item.title}</span>
        {#if item.subtitle !== null}
          <span class="type-meta shrink-0 text-text-low">{item.subtitle}</span>
        {/if}
      </li>
    {/each}
  </ul>

  {#if itemCount === 0}
    <p data-testid="today-empty" class="type-item mt-2 text-text-soft">
      fila zerada. descanse a memória — ela consolida dormindo.
    </p>
  {:else if reviewCount > 0}
    <a
      data-testid="start-next"
      href="/review"
      class="mt-6 inline-flex h-(--h-button-md) items-center rounded-base bg-accent px-5 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      começar revisão · {reviewCount}
      {reviewCount === 1 ? 'item' : 'itens'}
    </a>
  {:else if hasBlocks}
    <a
      data-testid="start-next"
      href="/study"
      class="mt-6 inline-flex h-(--h-button-md) items-center rounded-base bg-accent px-5 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      começar estudo
    </a>
  {/if}
</section>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <h2 class="type-label text-text-low">objetivos</h2>

  <form data-testid="goal-form" class="mt-8" {onsubmit}>
    <label class="type-label block text-text-low" for="goal-title">novo objetivo</label>
    <div class="mt-3 flex gap-2">
      <input
        id="goal-title"
        data-testid="goal-title-input"
        type="text"
        bind:value={title}
        placeholder="ex.: passar no concurso do TRF"
        autocomplete="off"
        class="type-item h-(--h-button-md) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
      />
      <button
        data-testid="goal-submit"
        type="submit"
        class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        criar objetivo
      </button>
    </div>
  </form>

  <ul data-testid="goal-list" class="mt-8">
    {#each store.goals as goal (goal.id)}
      <li
        data-testid="goal-item"
        class="type-item border-b border-hairline py-3 text-text-body first:border-t"
      >
        {goal.title}
      </li>
    {/each}
  </ul>

  {#if store.goals.length === 0}
    <p class="type-item mt-2 text-text-soft">nenhum objetivo ainda — crie o primeiro.</p>
  {/if}

  <div class="mt-10 flex items-center gap-3">
    <button
      data-testid="sync-now"
      type="button"
      onclick={syncNow}
      class="type-meta h-(--h-button-sm) cursor-pointer rounded-base border border-border px-4 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      sincronizar
    </button>
    <span class="type-meta text-text-low" aria-live="polite">{syncLabel}</span>
  </div>
</section>
