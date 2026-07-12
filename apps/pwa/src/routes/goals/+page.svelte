<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { createGoalsStore } from '$lib/stores/goals.svelte';
  import { dbState } from '$lib/stores/db-state.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  const store = createGoalsStore();
  let title = $state('');
  let targetDate = $state('');
  let modalOpen = $state(false);

  const writable = $derived(dbState.status === 'ready');
  const active = $derived(store.goals.filter((g) => g.status !== 'done'));
  const done = $derived(store.goals.filter((g) => g.status === 'done'));

  onDestroy(() => store.destroy());

  function openModal() {
    title = '';
    targetDate = '';
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
  }

  function onModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeModal();
  }

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!writable || title.trim() === '') return;
    const value = title;
    const at = targetDate === '' ? null : new Date(`${targetDate}T12:00:00`).getTime();
    title = '';
    targetDate = '';
    void store.add(value, at);
    closeModal();
    showToast('objetivo criado', 'success');
  }

  function targetLabel(ms: number): string {
    const days = Math.ceil((ms - Date.now()) / 86_400_000);
    const date = new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    if (days < 0) return `era até ${date}`;
    if (days === 0) return `até hoje`;
    return `até ${date} · ${days} ${days === 1 ? 'dia' : 'dias'}`;
  }
</script>

<svelte:head>
  <title>StudyOS — objetivos</title>
</svelte:head>

<svelte:window onkeydown={modalOpen ? onModalKeydown : undefined} />

<div class="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8 lg:py-7">
  <div class="rise flex flex-wrap items-end justify-between gap-4" style="--rise-i:0">
    <header>
      <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">objetivos</h1>
      <p class="type-meta mt-1 text-text-low tabular-nums">
        {store.goals.length === 0
          ? 'o que você quer conquistar — sem prazo apertado'
          : `${active.length} ${active.length === 1 ? 'ativo' : 'ativos'} · ${done.length} ${done.length === 1 ? 'conquistado' : 'conquistados'}`}
      </p>
    </header>
    <button
      data-testid="goal-open-modal"
      type="button"
      onclick={openModal}
      class="flex cursor-pointer items-center gap-2 rounded-base bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      <NavIcon name="plus" size={14} />
      novo objetivo
    </button>
  </div>

  <div
    class="rise mt-5 rounded-panel border border-hairline bg-surface px-4 py-4 lg:px-5"
    style="--rise-i:1"
  >
    <h2 class="card-head type-label text-text-low">
      <NavIcon name="target" size={12} />
      seus objetivos{store.goals.length > 0 ? ` · ${store.goals.length}` : ''}
    </h2>
    <ul data-testid="goal-list" class="mt-1">
      {#each [...active, ...done] as goal (goal.id)}
        <li
          data-testid="goal-item"
          transition:fly={{ y: 6, duration: 180 }}
          class="goal-row flex items-center gap-3 border-t border-hairline py-3 first:border-t-0"
        >
          <button
            data-testid="goal-toggle"
            type="button"
            role="checkbox"
            aria-checked={goal.status === 'done'}
            aria-label={goal.title}
            onclick={() => void store.toggleDone(goal)}
            class="goal-check {goal.status === 'done' ? 'goal-check-done' : ''}"
          >
            {#if goal.status === 'done'}✓{/if}
          </button>
          <span class="min-w-0 flex-1">
            <span
              class="block truncate font-body text-[14.5px] font-medium {goal.status === 'done'
                ? 'text-text-soft line-through decoration-hairline'
                : 'text-text-body'}"
            >
              {goal.title}
            </span>
            {#if goal.target_date !== null}
              <span class="text-[11px] text-text-low tabular-nums">
                {targetLabel(goal.target_date)}
              </span>
            {/if}
          </span>
          <button
            data-testid="goal-delete"
            type="button"
            aria-label="excluir objetivo {goal.title}"
            title="excluir objetivo"
            onclick={() => void store.remove(goal.id)}
            class="goal-del icon-btn"
          >
            <NavIcon name="trash" size={13} />
          </button>
        </li>
      {/each}
    </ul>
    {#if store.goals.length === 0}
      <div class="mt-3 rounded-base border border-dashed border-border px-4 py-8 text-center">
        <p class="type-item text-text-soft">
          nenhum objetivo ainda — objetivos guiam as metas da semana.
        </p>
        <button
          type="button"
          onclick={openModal}
          class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-base bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
        >
          <NavIcon name="plus" size={13} />
          criar primeiro objetivo
        </button>
      </div>
    {/if}
  </div>
</div>

{#if modalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeModal();
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-modal-title"
      class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 id="goal-modal-title" class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name="target" size={12} />
          novo objetivo
        </h2>
        <button type="button" aria-label="fechar" title="fechar" onclick={closeModal} class="icon-btn">
          <NavIcon name="x" size={13} />
        </button>
      </div>
      <form data-testid="goal-form" class="mt-3" {onsubmit}>
        <label class="sr-only" for="goal-title">novo objetivo</label>
        <input
          id="goal-title"
          data-testid="goal-title-input"
          type="text"
          bind:value={title}
          placeholder="ex.: passar no TRF até dezembro"
          autocomplete="off"
          disabled={!writable}
          class="type-item h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low disabled:opacity-50"
        />
        <label class="type-label mt-3 block text-text-low" for="goal-date">
          data alvo · opcional
        </label>
        <input
          id="goal-date"
          data-testid="goal-date-input"
          type="date"
          bind:value={targetDate}
          disabled={!writable}
          class="type-item mt-2 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body disabled:opacity-50"
        />
        <button
          data-testid="goal-submit"
          type="submit"
          disabled={!writable || title.trim() === ''}
          class="mt-3 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <NavIcon name="plus" size={14} />
          criar objetivo
        </button>
      </form>
    </div>
  </div>
{/if}

<style>
  .goal-check {
    width: 21px;
    height: 21px;
    flex-shrink: 0;
    cursor: pointer;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--accent-ink);
    font: 600 12px/1 var(--font-display);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color var(--dur-base) var(--ease),
      border-color var(--dur-base) var(--ease),
      transform var(--dur-base) var(--ease);
  }
  .goal-check:hover {
    border-color: var(--accent);
  }
  .goal-check:active {
    transform: scale(0.9);
  }
  .goal-check-done {
    background: var(--accent);
    border-color: var(--accent);
  }

  .goal-del {
    opacity: 0;
  }
  .goal-row:hover .goal-del,
  .goal-del:focus-visible {
    opacity: 1;
  }
</style>
