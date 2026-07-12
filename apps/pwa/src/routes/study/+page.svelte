<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Checklist from '$lib/components/Checklist.svelte';
  import Bars from '$lib/components/charts/Bars.svelte';
  import ErrorLogModal from '$lib/components/ErrorLogModal.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
  import { createFocusStore } from '$lib/stores/focus.svelte';
  import { createSessionStore, type SessionType } from '$lib/stores/session.svelte';
  import { createTodayStore } from '$lib/stores/today.svelte';
  import { dbState } from '$lib/stores/db-state.svelte';

  const store = createSessionStore();
  const focus = createFocusStore();
  const today = createTodayStore();

  const reviewItems = $derived(today.items.filter((i) => i.kind === 'review').length);
  const blockItems = $derived(today.items.filter((i) => i.kind === 'block').slice(0, 2));

  function startBlock() {
    store.type = 'theory';
    void store.start();
  }

  const types: { value: SessionType; label: string }[] = [
    { value: 'theory', label: 'teoria' },
    { value: 'questions', label: 'questões' },
    { value: 'review', label: 'revisão' },
    { value: 'reading', label: 'leitura' },
  ];
  const TYPE_LABEL: Record<string, string> = {
    theory: 'teoria',
    questions: 'questões',
    review: 'revisão',
    reading: 'leitura',
  };

  let questionsTotal = $state<number | null>(null);
  let questionsCorrect = $state<number | null>(null);
  let errorModalOpen = $state(false);
  let errorModalTopic = $state<string | null>(null);
  // pós-sessão de questões com erros: convite calmo para registrá-los
  let pendingErrors = $state<{ count: number; topicId: string | null } | null>(null);
  let notes = $state('');

  // Pomodoro method: 25min of focus per cycle; the ring sweeps one cycle.
  const ARC_SECONDS = 25 * 60;
  const writable = $derived(dbState.status === 'ready');

  const pomosInSession = $derived(Math.floor(store.netSeconds / ARC_SECONDS));
  const pomoRemaining = $derived(ARC_SECONDS - (store.netSeconds % ARC_SECONDS));
  const pomosToday = $derived(
    Math.floor(focus.data.todayMin / 25) +
      (store.phase === 'running' || store.phase === 'paused' ? pomosInSession : 0),
  );
  const justCompletedPomo = $derived(
    store.phase === 'running' && store.netSeconds >= ARC_SECONDS && store.netSeconds % ARC_SECONDS < 90,
  );

  function fmtClock(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

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
        if (justCompletedPomo) {
          return `pomodoro ${pomosInSession} completo — 5min de pausa fazem parte do método`;
        }
        return `pomodoro ${pomosInSession + 1} · faltam ${fmtClock(pomoRemaining)} · só o tempo focado conta`;
      case 'paused':
        return 'pausado · o tempo espera com você';
      case 'logging':
        return 'sessão concluída · registre os detalhes';
      default:
        return store.summary ?? `pronto quando você estiver · 1 pomodoro = 25min de foco`;
    }
  });

  const checklistVisible = $derived(
    store.sessionId !== null && (store.phase === 'running' || store.phase === 'paused'),
  );

  // starts neutral so the prerendered HTML matches the first client render
  let clock = $state<Date | null>(null);
  onMount(() => {
    clock = new Date();
  });
  const dateLine = $derived(
    clock === null
      ? 'hoje'
      : clock.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
  );

  function fmtMin(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  function whenLabel(startedAt: number): string {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    if (startedAt >= startOfToday) return 'hoje';
    if (startedAt >= startOfToday - 86_400_000) return 'ontem';
    return new Date(startedAt).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  }

  onDestroy(() => {
    store.destroy();
    focus.destroy();
    today.destroy();
  });

  function normalize(value: number | null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  async function onSave(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = notes.trim();
    const total = normalize(questionsTotal);
    const correct = normalize(questionsCorrect);
    await store.save({
      questionsTotal: total,
      questionsCorrect: correct,
      notes: trimmed === '' ? null : trimmed,
    });
    if (total !== null && correct !== null && correct < total) {
      pendingErrors = { count: total - correct, topicId: null };
    }
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

<div class="mx-auto w-full max-w-[1120px] px-4 py-6 lg:px-8 lg:py-7">
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_264px]">
    <!-- stage -->
    <section class="flex min-w-0 flex-col gap-5">
      <header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">foco</h1>
          <button
            data-testid="error-log-open"
            type="button"
            onclick={() => {
              errorModalTopic = null;
              errorModalOpen = true;
            }}
            class="type-meta cursor-pointer rounded-base border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            registrar erro
          </button>
        </div>
        <p class="type-meta mt-1 text-text-low tabular-nums">{dateLine}</p>
      </header>

      <div class="rise grid grid-cols-2 gap-3 lg:grid-cols-4" style="--rise-i:1">
        <div class="rounded-panel border border-(--accent-dim)/40 bg-(--accent-tint-09) px-4 py-3">
          <p class="type-label text-accent">hoje</p>
          <p class="mt-1 text-[22px] font-semibold text-text-hi tabular-nums">
            {fmtMin(focus.data.todayMin)}
          </p>
          <p class="mt-0.5 text-[11px] text-accent">líquidas</p>
        </div>
        <div class="rounded-panel border border-hairline bg-surface px-4 py-3">
          <p class="type-label text-text-low">na semana</p>
          <p class="mt-1 text-[22px] font-semibold text-text-hi tabular-nums">
            {fmtMin(focus.data.weekMin)}
          </p>
          <p class="mt-0.5 text-[11px] text-text-soft tabular-nums">
            {focus.data.weekSessions}
            {focus.data.weekSessions === 1 ? 'sessão' : 'sessões'}
          </p>
        </div>
        <div class="rounded-panel border border-hairline bg-surface px-4 py-3">
          <p class="type-label text-text-low">a rever</p>
          <p class="mt-1 text-[22px] font-semibold text-text-hi tabular-nums">{reviewItems}</p>
          <p class="mt-0.5 text-[11px] text-text-soft tabular-nums">
            {reviewItems > 0 ? `≈ ${Math.max(1, reviewItems * 2)} min` : 'em dia'}
          </p>
        </div>
        <div class="rounded-panel border border-hairline bg-surface px-4 py-3">
          <p class="type-label text-text-low">sequência</p>
          <p class="mt-1 text-[22px] font-semibold text-text-hi tabular-nums">
            {focus.data.streakDays}
            <span class="text-[12px] font-medium text-text-soft">
              {focus.data.streakDays === 1 ? 'dia' : 'dias'}
            </span>
          </p>
        </div>
      </div>

      {#if store.phase === 'idle' && (reviewItems > 0 || blockItems.length > 0)}
        <div class="rise rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:2">
          <h2 class="card-head type-label text-text-low">
          <NavIcon name="play" size={12} />
          estudar agora
        </h2>
          <ul>
            {#if reviewItems > 0}
              <li
                class="flex items-center gap-3 border-t border-hairline py-2.5 first:mt-2 first:border-t-0"
              >
                <span class="sug-dot sug-review" aria-hidden="true"></span>
                <span class="min-w-0 flex-1">
                  <span class="block font-body text-[14px] font-medium text-text-body">
                    revisões de hoje
                  </span>
                  <span class="text-[11px] text-text-low tabular-nums">
                    {reviewItems}
                    {reviewItems === 1 ? 'card' : 'cards'} · ≈ {Math.max(1, reviewItems * 2)} min
                  </span>
                </span>
                <a
                  href="/review"
                  class="shrink-0 rounded-base border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                >
                  revisar →
                </a>
              </li>
            {/if}
            {#each blockItems as block (block.title)}
              <li
                class="flex items-center gap-3 border-t border-hairline py-2.5 first:mt-2 first:border-t-0"
              >
                <span class="sug-dot sug-block" aria-hidden="true"></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-body text-[14px] font-medium text-text-body">
                    {block.title}
                  </span>
                  {#if block.subtitle !== null}
                    <span class="text-[11px] text-text-low tabular-nums">{block.subtitle}</span>
                  {/if}
                </span>
                <button
                  type="button"
                  disabled={!writable}
                  onclick={startBlock}
                  class="shrink-0 cursor-pointer rounded-base border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-not-allowed disabled:opacity-50"
                >
                  iniciar sessão
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div
        style="--rise-i:3"
        class="rise rounded-panel border border-hairline bg-surface px-4 py-5 transition-opacity duration-(--dur-slow) ease-brand lg:px-6 {store.phase ===
        'paused'
          ? 'opacity-60'
          : ''}"
      >
        <div class="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div class="justify-self-center text-center">
            <div
              class="timer-ring {store.phase === 'running' ? 'timer-live' : ''}"
              style:background="conic-gradient(var(--accent) {arcDegrees}deg, var(--hairline) {arcDegrees}deg)"
            >
              <div class="timer-inner">
                <span data-testid="study-timer" class="timer-digits text-text-hi">{display}</span>
              </div>
            </div>
            <div
              class="mt-3 flex items-center justify-center gap-1.5"
              role="img"
              aria-label={`${pomosToday} pomodoros hoje`}
            >
              {#each Array.from({ length: 8 }) as _, i (i)}
                <span
                  class="pomo-dot {i < pomosToday ? 'pomo-done' : ''} {store.phase === 'running' &&
                  i === pomosToday
                    ? 'pomo-live'
                    : ''}"
                ></span>
              {/each}
            </div>
            <p class="type-meta mt-1.5 text-text-low tabular-nums">
              {pomosToday}
              {pomosToday === 1 ? 'pomodoro hoje' : 'pomodoros hoje'}
            </p>
          </div>

          <div class="min-w-0">
            {#if store.phase === 'idle'}
              <fieldset>
                <legend class="type-label text-text-low">tipo de sessão</legend>
                <div class="mt-2.5 flex gap-1 rounded-base border border-border p-1">
                  {#each types as sessionType (sessionType.value)}
                    <label
                      class="segment {store.type === sessionType.value ? 'segment-active' : ''}"
                    >
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
            {:else}
              <p class="type-label text-text-low">
                sessão de {TYPE_LABEL[store.type] ?? store.type}
              </p>
            {/if}

            <p class="type-meta mt-4 text-text-low" aria-live="polite">{statusLabel}</p>

            <div class="mt-4 flex flex-wrap gap-3">
              {#if store.phase === 'idle'}
                <button
                  data-testid="timer-start"
                  type="button"
                  disabled={!writable}
                  onclick={() => void store.start()}
                  class="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>
        </div>
      </div>

      {#if store.phase === 'logging'}
        <div class="rounded-panel border border-hairline bg-surface px-4 py-4 lg:px-5">
          <h2 class="card-head type-label text-text-low">
          <NavIcon name="check" size={12} />
          registro da sessão
        </h2>
          <form data-testid="session-form" class="mt-3" onsubmit={onSave}>
            <label class="type-label block text-text-low" for="session-type-select">tipo</label>
            <select
              id="session-type-select"
              data-testid="session-type-select"
              bind:value={store.type}
              class="field mt-2 w-full"
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
                  class="field mt-2 w-full"
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
                  class="field mt-2 w-full"
                />
              </div>
            </div>

            <label class="type-label mt-4 block text-text-low" for="session-notes">
              explique em 2 frases o que você estudou · opcional
            </label>
            <textarea
              id="session-notes"
              data-testid="elaboration-input"
              bind:value={notes}
              rows="3"
              placeholder="como foi a sessão? (opcional)"
              class="field mt-2 w-full py-2.5"></textarea>

            <button data-testid="session-save" type="submit" class="btn-primary mt-5">
              salvar sessão
            </button>
          </form>
        </div>
      {/if}

      {#if checklistVisible && store.sessionId !== null}
        {#key store.sessionId}
          <div class="rounded-panel border border-hairline bg-surface px-4 py-4 lg:px-5">
            <h2 class="card-head type-label text-text-low">
          <NavIcon name="list" size={12} />
          checklist da sessão
        </h2>
            <div class="mt-2">
              <Checklist refKind="session" refId={store.sessionId} />
            </div>
          </div>
        {/key}
      {/if}
    </section>

    <!-- rail -->
    <aside class="flex min-w-0 flex-col gap-3">
      <div class="rise rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:4">
        <h2 class="card-head type-label text-text-low">
          <NavIcon name="flame" size={12} />
          sequência de foco
        </h2>
        <p class="mt-2 text-[26px] font-semibold text-text-hi tabular-nums">
          {focus.data.streakDays}
          <span class="text-[13px] font-medium text-text-soft">
            {focus.data.streakDays === 1 ? 'dia seguido' : 'dias seguidos'}
          </span>
        </p>
        <div class="mt-2.5 flex gap-1.5" aria-hidden="true">
          {#each focus.data.streakPills as pill, i (i)}
            <span
              class="grid h-7 w-7 place-items-center rounded-full border text-[10px] {pill.today
                ? 'border-accent bg-accent font-semibold text-accent-ink'
                : pill.hit
                  ? 'border-transparent bg-(--accent-tint-12) text-accent'
                  : 'border-hairline text-text-low'}"
            >
              {pill.hit && !pill.today ? '✓' : pill.label}
            </span>
          {/each}
        </div>
      </div>

      <div class="rise rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:5">
        <h2 class="card-head type-label text-text-low">
          <NavIcon name="chart" size={12} />
          atividade da semana
        </h2>
        <p class="mt-2 text-[20px] font-semibold text-text-hi tabular-nums">
          {fmtMin(focus.data.weekMin)}
          <span class="text-[11.5px] font-medium text-text-soft">de foco</span>
        </p>
        {#if focus.data.weekBars.length > 0}
          <div class="mt-3">
            <Bars
              bars={focus.data.weekBars.map((b) => ({
                label: b.label,
                value: b.min,
                highlight: b.today,
              }))}
              ariaLabel="minutos de foco por dia nesta semana"
              height={80}
              fmt={(v) => fmtMin(v)}
            />
          </div>
        {/if}
      </div>

      <div class="rise rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:6">
        <h2 class="card-head type-label text-text-low">
          <NavIcon name="clock" size={12} />
          últimas sessões
        </h2>
        {#if focus.data.recent.length === 0}
          <p class="type-meta mt-2 text-text-soft">a primeira sessão começa aqui do lado.</p>
        {:else}
          <ul>
            {#each focus.data.recent as session (session.id)}
              <li class="border-t border-hairline py-2 first:mt-2 first:border-t-0">
                <span class="flex items-baseline justify-between gap-2">
                  <span class="font-body text-[13px] font-medium text-text-body">
                    {TYPE_LABEL[session.type] ?? session.type}
                  </span>
                  <span class="shrink-0 text-[10.5px] text-text-low tabular-nums">
                    {whenLabel(session.started_at)} · {fmtMin(Math.round(session.net_seconds / 60))}
                  </span>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div
        class="rise rounded-panel border border-hairline border-l-[3px] border-l-accent bg-surface px-4 py-3.5"
        style="--rise-i:7"
      >
        <h2 class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name="bell" size={12} />
          lembrete calmo
        </h2>
        <p class="mt-1.5 font-body text-[13.5px] leading-relaxed text-text-mid italic">
          pausas fazem parte — o cronômetro só conta o tempo que você está aqui.
        </p>
      </div>
    </aside>
  </div>
</div>

{#if pendingErrors !== null}
  <div
    data-testid="error-log-prompt"
    class="fixed inset-x-0 bottom-16 z-40 mx-auto flex w-fit items-center gap-3 rounded-base border border-border bg-bg-deep px-4 py-2.5 shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
  >
    <p class="type-item text-text-body">
      registrar {pendingErrors.count === 1 ? 'o erro' : `os ${pendingErrors.count} erros`} desta
      sessão?
    </p>
    <button
      data-testid="error-log-prompt-yes"
      type="button"
      onclick={() => {
        errorModalTopic = pendingErrors?.topicId ?? null;
        errorModalOpen = true;
        pendingErrors = null;
      }}
      class="type-meta cursor-pointer rounded-base bg-accent px-3 py-1.5 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      registrar
    </button>
    <button
      type="button"
      aria-label="dispensar"
      onclick={() => (pendingErrors = null)}
      class="icon-btn"
    >
      <NavIcon name="x" size={12} />
    </button>
  </div>
{/if}

{#if errorModalOpen}
  <ErrorLogModal topicId={errorModalTopic} onClose={() => (errorModalOpen = false)} />
{/if}

<style>
  .sug-dot {
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
  }
  .sug-review {
    border: 2px solid var(--accent);
  }
  .sug-block {
    border-radius: 2.5px;
    border: 2px solid var(--text-low);
  }

  .timer-ring {
    width: 208px;
    height: 208px;
    border-radius: 50%;
    padding: 6px;
  }

  .pomo-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1.5px solid var(--hairline);
    transition: background-color var(--dur-base) var(--ease);
  }
  .pomo-done {
    background: var(--accent);
    border-color: var(--accent);
  }
  @media (prefers-reduced-motion: no-preference) {
    .pomo-live {
      border-color: var(--accent);
      animation: pomo-pulse 2.4s var(--ease-brand) infinite;
    }
  }
  @keyframes pomo-pulse {
    0%,
    100% {
      background: transparent;
    }
    50% {
      background: var(--accent-tint-12);
    }
  }


  /* soft breathing halo while the session runs — calm, never urgent */
  @media (prefers-reduced-motion: no-preference) {
    .timer-live {
      animation: breathe 3.2s var(--ease-brand) infinite;
    }
  }
  @keyframes breathe {
    0%,
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
    50% {
      box-shadow: 0 0 28px 0 var(--accent-tint-12);
    }
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
    background: var(--bg);
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
