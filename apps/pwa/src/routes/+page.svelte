<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createGoalsStore } from '$lib/stores/goals.svelte';
  import { requestSync, syncState } from '$lib/sync/index.svelte';

  const store = createGoalsStore();
  let title = $state('');

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

  onDestroy(() => store.destroy());

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

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">hoje</p>
  <h1 class="type-h1 mt-2 text-text-hi">objetivos</h1>

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
