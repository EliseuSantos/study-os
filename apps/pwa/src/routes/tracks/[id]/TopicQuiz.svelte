<script lang="ts">
  // Prática de teste por tópico: os cards kind='quiz' saem das aulas e viram
  // sessão avulsa com correção imediata; o placar grava uma sessão de questões
  // (notes='quiz') — acurácia medida, não autorrelatada.
  import { finishSession, getOrCreateDeviceId, startSession } from '@studyos/db';
  import type { CardRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { showToast } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  interface Quiz {
    q: string;
    options: string[];
    answer: number; // 0-based (UI shows 1-based)
  }

  let {
    cards,
    trackId,
    topicId,
    onClose,
  }: {
    cards: CardRow[];
    trackId: string;
    topicId: string;
    onClose: () => void;
  } = $props();

  const questions = $derived(
    cards.flatMap((card): Quiz[] => {
      try {
        const parsed = JSON.parse(card.front_md) as Quiz;
        return parsed.q && Array.isArray(parsed.options) ? [parsed] : [];
      } catch {
        return [];
      }
    }),
  );

  let index = $state(0);
  let picked = $state<number | null>(null);
  let correct = $state(0);
  let finished = $state(false);
  let saving = $state(false);
  const startedAt = Date.now();

  const current = $derived(questions[index] ?? null);

  function pick(option: number): void {
    if (picked !== null || current === null) return;
    picked = option;
    if (option === current.answer) correct += 1;
  }

  function next(): void {
    if (picked === null) return;
    picked = null;
    if (index + 1 >= questions.length) {
      finished = true;
      void saveSession();
    } else {
      index += 1;
    }
  }

  async function saveSession(): Promise<void> {
    if (saving) return;
    saving = true;
    try {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      const session = await startSession(db, deviceId, {
        track_id: trackId,
        topic_id: topicId,
        type: 'questions',
      });
      await finishSession(db, deviceId, session.id, {
        ended_at: Date.now(),
        net_seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        questions_total: questions.length,
        questions_correct: correct,
        notes: 'quiz',
      });
      showToast('prática registrada — acurácia medida', 'success');
    } catch {
      showToast('não deu para registrar a prática', 'error');
    } finally {
      saving = false;
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (current === null || finished) return;
    const n = Number(event.key);
    if (Number.isInteger(n) && n >= 1 && n <= current.options.length) {
      event.preventDefault();
      pick(n - 1);
    } else if (event.key === 'Enter' && picked !== null) {
      event.preventDefault();
      next();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="modal-backdrop"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="topic-quiz-title"
    data-testid="topic-quiz"
    class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="topic-quiz-title" class="flex items-center gap-1.5 type-label text-text-low">
        <NavIcon name="check" size={12} />
        praticar
        {#if !finished}
          <span class="tabular-nums">· {index + 1} de {questions.length}</span>
        {/if}
      </h2>
      <button type="button" aria-label="fechar" onclick={onClose} class="icon-btn">
        <NavIcon name="x" size={13} />
      </button>
    </div>

    {#if finished}
      <div class="mt-6 text-center">
        <p data-testid="quiz-score" class="text-[32px] font-semibold text-text-hi tabular-nums">
          {correct} de {questions.length}
        </p>
        <p class="type-item mt-2 text-text-soft">
          {correct === questions.length
            ? 'tudo certo — memória em dia.'
            : 'os erros são o material da próxima revisão.'}
        </p>
        <button
          type="button"
          onclick={onClose}
          class="mt-5 h-(--h-button-md) w-full cursor-pointer rounded-base border border-border text-[13px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          fechar
        </button>
      </div>
    {:else if current !== null}
      <p data-testid="quiz-question" class="mt-4 font-body text-[16px] text-text-reading">
        {current.q}
      </p>
      <ul class="mt-4 flex flex-col gap-2" role="list">
        {#each current.options as option, i (i)}
          <li>
            <button
              data-testid="quiz-option"
              type="button"
              disabled={picked !== null}
              onclick={() => pick(i)}
              class="flex w-full cursor-pointer items-start gap-2.5 rounded-base border px-3 py-2.5 text-left text-[14px] transition-colors duration-(--dur-base) ease-brand disabled:cursor-default {picked ===
              null
                ? 'border-border text-text-body hover:text-text-hi'
                : i === current.answer
                  ? 'border-success bg-(--accent-tint-08) text-text-hi'
                  : i === picked
                    ? 'border-accent-dim text-text-soft'
                    : 'border-hairline text-text-low'}"
            >
              <kbd
                class="mt-0.5 rounded-micro border border-border px-1.5 text-[10px] text-text-low"
                aria-hidden="true"
              >
                {i + 1}
              </kbd>
              {option}
            </button>
          </li>
        {/each}
      </ul>
      {#if picked !== null}
        <p class="type-item mt-3 text-text-soft" aria-live="polite">
          {picked === current.answer ? 'certa.' : `a resposta era a ${current.answer + 1}.`}
        </p>
        <button
          data-testid="quiz-next"
          type="button"
          onclick={next}
          class="mt-3 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
        >
          {index + 1 >= questions.length ? 'ver placar' : 'próxima'}
        </button>
      {/if}
    {/if}
  </div>
</div>
