<script lang="ts">
  import { onDestroy } from 'svelte';
  import Checklist from '$lib/components/Checklist.svelte';
  import { createSessionStore, type SessionType } from '$lib/stores/session.svelte';

  const store = createSessionStore();

  const types: { value: SessionType; label: string }[] = [
    { value: 'theory', label: 'teoria' },
    { value: 'questions', label: 'questões' },
    { value: 'review', label: 'revisão' },
    { value: 'reading', label: 'leitura' },
  ];

  let questionsTotal = $state<number | null>(null);
  let questionsCorrect = $state<number | null>(null);
  let notes = $state('');

  const ARC_SECONDS = 25 * 60; // one full turn of the arc every 25 min

  const display = $derived.by(() => {
    const total = store.netSeconds;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
  });

  const arcDegrees = $derived(
    store.phase === 'idle' ? 0 : ((store.netSeconds % ARC_SECONDS) / ARC_SECONDS) * 360,
  );

  const statusLabel = $derived.by(() => {
    switch (store.phase) {
      case 'running':
        return 'em andamento · só o tempo focado conta';
      case 'paused':
        return 'pausado · o tempo espera com você';
      case 'logging':
        return 'sessão concluída · registre os detalhes';
      default:
        return store.summary ?? 'pronto quando você estiver';
    }
  });

  const checklistVisible = $derived(
    store.sessionId !== null && (store.phase === 'running' || store.phase === 'paused'),
  );

  onDestroy(() => store.destroy());

  function normalize(value: number | null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  async function onSave(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = notes.trim();
    await store.save({
      questionsTotal: normalize(questionsTotal),
      questionsCorrect: normalize(questionsCorrect),
      notes: trimmed === '' ? null : trimmed,
    });
    questionsTotal = null;
    questionsCorrect = null;
    notes = '';
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (store.phase === 'running' || store.phase === 'paused') event.preventDefault();
  }
</script>

<svelte:head>
  <title>StudyOS — foco</title>
</svelte:head>

<svelte:window onbeforeunload={onBeforeUnload} />

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <div
    class="transition-opacity duration-(--dur-slow) ease-brand {store.phase === 'paused'
      ? 'opacity-60'
      : ''}"
  >
    <p class="type-label text-text-low">foco</p>
    <h1 class="type-h1 mt-2 text-text-hi">horas líquidas</h1>

    {#if store.phase === 'idle'}
      <fieldset class="mt-8">
        <legend class="type-label text-text-low">tipo de sessão</legend>
        <div class="mt-3 flex gap-1 rounded-base border border-border p-1">
          {#each types as sessionType (sessionType.value)}
            <label class="segment {store.type === sessionType.value ? 'segment-active' : ''}">
              <input
                type="radio"
                name="session-type"
                value={sessionType.value}
                bind:group={store.type}
                class="sr-only"
              />
              {sessionType.label}
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

    <div class="mt-10 flex justify-center">
      <div
        class="timer-ring"
        style:background="conic-gradient(var(--accent) {arcDegrees}deg, var(--hairline) {arcDegrees}deg)"
      >
        <div class="timer-inner">
          <span data-testid="study-timer" class="timer-digits text-text-hi">{display}</span>
        </div>
      </div>
    </div>

    <p class="type-meta mt-6 text-center text-text-low" aria-live="polite">{statusLabel}</p>

    <div class="mt-8 flex justify-center gap-3">
      {#if store.phase === 'idle'}
        <button
          data-testid="timer-start"
          type="button"
          onclick={() => void store.start()}
          class="btn-primary"
        >
          começar sessão
        </button>
      {:else if store.phase === 'running'}
        <button
          data-testid="timer-pause"
          type="button"
          onclick={() => store.pause()}
          class="btn-quiet"
        >
          pausar
        </button>
        <button
          data-testid="timer-finish"
          type="button"
          onclick={() => store.finish()}
          class="btn-primary"
        >
          concluir sessão
        </button>
      {:else if store.phase === 'paused'}
        <button
          data-testid="timer-resume"
          type="button"
          onclick={() => store.resume()}
          class="btn-primary"
        >
          retomar
        </button>
        <button
          data-testid="timer-finish"
          type="button"
          onclick={() => store.finish()}
          class="btn-quiet"
        >
          concluir sessão
        </button>
      {/if}
    </div>

    {#if store.phase === 'logging'}
      <form data-testid="session-form" class="mt-10" onsubmit={onSave}>
        <label class="type-label block text-text-low" for="session-type-select">tipo</label>
        <select
          id="session-type-select"
          data-testid="session-type-select"
          bind:value={store.type}
          class="field mt-3 w-full"
        >
          {#each types as sessionType (sessionType.value)}
            <option value={sessionType.value}>{sessionType.label}</option>
          {/each}
        </select>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <div>
            <label class="type-label block text-text-low" for="session-questions-total">
              questões
            </label>
            <input
              id="session-questions-total"
              data-testid="session-questions-total"
              type="number"
              min="0"
              bind:value={questionsTotal}
              placeholder="opcional"
              class="field mt-3 w-full"
            />
          </div>
          <div>
            <label class="type-label block text-text-low" for="session-questions-correct">
              acertos
            </label>
            <input
              id="session-questions-correct"
              data-testid="session-questions-correct"
              type="number"
              min="0"
              bind:value={questionsCorrect}
              placeholder="opcional"
              class="field mt-3 w-full"
            />
          </div>
        </div>

        <label class="type-label mt-4 block text-text-low" for="session-notes">anotações</label>
        <textarea
          id="session-notes"
          data-testid="session-notes"
          bind:value={notes}
          rows="3"
          placeholder="como foi a sessão? (opcional)"
          class="field mt-3 w-full py-2.5"></textarea>

        <button data-testid="session-save" type="submit" class="btn-primary mt-6">
          salvar sessão
        </button>
      </form>
    {/if}

    {#if checklistVisible && store.sessionId !== null}
      {#key store.sessionId}
        <div class="mt-12">
          <p class="type-label text-text-low">checklist da sessão</p>
          <div class="mt-3">
            <Checklist refKind="session" refId={store.sessionId} />
          </div>
        </div>
      {/key}
    {/if}
  </div>
</section>

<style>
  .timer-ring {
    width: 264px;
    height: 264px;
    border-radius: 50%;
    padding: 6px;
  }

  .timer-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .timer-digits {
    font: var(--type-timer);
    letter-spacing: var(--ls-tight-1);
    font-variant-numeric: tabular-nums;
  }

  .segment {
    flex: 1;
    cursor: pointer;
    text-align: center;
    padding: 10px 8px;
    border-radius: var(--radius-inner);
    font: var(--type-button-sm);
    color: var(--text-mid);
    transition:
      background-color var(--dur-base) var(--ease),
      color var(--dur-base) var(--ease);
  }

  .segment:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .segment-active {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .btn-primary {
    height: var(--h-button-md);
    padding: 0 20px;
    cursor: pointer;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-ink);
    font: var(--type-button);
    transition: opacity var(--dur-base) var(--ease);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-quiet {
    height: var(--h-button-md);
    padding: 0 20px;
    cursor: pointer;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    color: var(--text-mid);
    font: 600 13px/1 var(--font-display);
    transition: color var(--dur-base) var(--ease);
  }

  .btn-quiet:hover {
    color: var(--text-hi);
  }

  .field {
    height: var(--h-button-md);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-body);
    padding: 0 12px;
    font: var(--type-item);
    font-variant-numeric: tabular-nums;
  }

  .field::placeholder {
    color: var(--text-low);
  }

  textarea.field {
    height: auto;
    font: var(--type-item);
    resize: vertical;
  }
</style>
