<script lang="ts">
  import type { CardRow, TopicRow } from '@studyos/shared';
  import {
    attemptStatsByTopic,
    getOrCreateDeviceId,
    updateCard,
    type AttemptStats,
  } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { showToast } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
  import TopicQuiz from './TopicQuiz.svelte';

  let {
    topic,
    cards,
    trackId,
    onadd,
    onaddQuiz,
  }: {
    topic: TopicRow;
    cards: CardRow[];
    trackId: string;
    onadd: (front: string, back: string) => Promise<void>;
    onaddQuiz: (frontJson: string) => Promise<void>;
  } = $props();

  const quizCards = $derived(cards.filter((c) => c.kind === 'quiz'));

  function parseQuizFront(
    frontMd: string,
  ): { q: string; options: string[]; answer: number } | null {
    try {
      const parsed = JSON.parse(frontMd) as { q: string; options: string[]; answer: number };
      return parsed.q && Array.isArray(parsed.options) ? parsed : null;
    } catch {
      return null;
    }
  }
  let quizOpen = $state(false);

  let front = $state('');
  let back = $state('');
  let formOpen = $state(false);
  // quiz authoring: same form, alternate shape
  let kind = $state<'basic' | 'quiz'>('basic');
  let question = $state('');
  let options = $state<string[]>(['', '']);
  let answer = $state(0); // 0-based; UI shows 1-based
  let editingId = $state<string | null>(null);

  // per-question local error rate (question_attempts is device-local)
  let attemptStats = $state<Map<string, AttemptStats>>(new Map());
  $effect(() => {
    const id = topic.id;
    void quizCards.length; // refresh when the quiz set changes
    void quizOpen; // …and when a practice session closes
    void getDb()
      .then((db) => attemptStatsByTopic(db, id))
      .then((stats) => (attemptStats = stats))
      .catch(() => {});
  });

  function resetForm(): void {
    front = '';
    back = '';
    question = '';
    options = ['', ''];
    answer = 0;
    editingId = null;
    kind = 'basic';
    formOpen = false;
  }

  function openEdit(card: CardRow): void {
    if (card.kind !== 'quiz') return;
    try {
      const parsed = JSON.parse(card.front_md) as { q: string; options: string[]; answer: number };
      question = parsed.q;
      options = [...parsed.options];
      answer = parsed.answer;
      kind = 'quiz';
      editingId = card.id;
      formOpen = true;
    } catch {
      showToast('não deu para abrir esta questão', 'error');
    }
  }

  const quizValid = $derived(
    question.trim() !== '' &&
      options.length >= 2 &&
      options.every((o) => o.trim() !== '') &&
      answer >= 0 &&
      answer < options.length,
  );

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (kind === 'quiz') {
      if (!quizValid) return;
      const payload = JSON.stringify({
        q: question.trim(),
        options: options.map((o) => o.trim()),
        answer,
      });
      void (async () => {
        if (editingId !== null) {
          const db = await getDb();
          const deviceId = await getOrCreateDeviceId(db);
          await updateCard(db, deviceId, editingId, { front_md: payload });
          showToast('questão atualizada', 'success');
        } else {
          await onaddQuiz(payload);
          showToast('questão criada', 'success');
        }
        resetForm();
      })();
      return;
    }
    const frontValue = front.trim();
    if (!frontValue) return;
    const backValue = back;
    resetForm();
    void onadd(frontValue, backValue);
  }
</script>

<div class="flex items-center justify-between gap-3">
  <p class="type-meta text-text-low tabular-nums">
    {cards.length === 0
      ? `nenhum card em ${topic.title}`
      : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} neste tópico`}
  </p>
  {#if quizCards.length > 0}
    <button
      data-testid="topic-quiz-start"
      type="button"
      onclick={() => (quizOpen = true)}
      class="type-meta cursor-pointer rounded-base border border-border px-2.5 py-1 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      praticar · {quizCards.length}
    </button>
  {/if}
  <button
    data-testid="card-form-toggle"
    type="button"
    aria-expanded={formOpen}
    onclick={() => (formOpen = !formOpen)}
    class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-base border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
  >
    <NavIcon name={formOpen ? 'x' : 'plus'} size={12} />
    {formOpen ? 'cancelar' : 'novo card'}
  </button>
</div>

{#if formOpen}
  <form data-testid="card-form" class="mt-3 rounded-base border border-hairline bg-bg p-3.5" {onsubmit}>
    {#if editingId === null}
      <div
        data-testid="card-kind-toggle"
        role="group"
        aria-label="tipo do card"
        class="mb-3 inline-flex overflow-hidden rounded-base border border-border"
      >
        <button
          type="button"
          aria-pressed={kind === 'basic'}
          onclick={() => (kind = 'basic')}
          class="type-meta cursor-pointer px-3 py-1.5 transition-colors duration-(--dur-base) ease-brand {kind ===
          'basic'
            ? 'bg-surface-2 text-text-hi'
            : 'text-text-mid hover:text-text-hi'}"
        >
          frente e verso
        </button>
        <button
          type="button"
          aria-pressed={kind === 'quiz'}
          onclick={() => (kind = 'quiz')}
          class="type-meta cursor-pointer border-l border-hairline px-3 py-1.5 transition-colors duration-(--dur-base) ease-brand {kind ===
          'quiz'
            ? 'bg-surface-2 text-text-hi'
            : 'text-text-mid hover:text-text-hi'}"
        >
          questão
        </button>
      </div>
    {/if}

    {#if kind === 'quiz'}
      <label class="type-label block text-text-low" for="quiz-question">enunciado</label>
      <textarea
        id="quiz-question"
        data-testid="quiz-question-input"
        bind:value={question}
        rows="2"
        autocomplete="off"
        placeholder="ex.: quem pode exercer o controle difuso?"
        class="type-item mt-2 w-full rounded-base border border-border bg-surface p-3 text-text-body placeholder:text-text-low"
      ></textarea>

      <p class="type-label mt-3 text-text-low">alternativas · marque a correta</p>
      {#each options as _, i (i)}
        <div class="mt-2 flex items-center gap-2">
          <input
            type="radio"
            name="quiz-answer"
            aria-label={`alternativa ${i + 1} é a correta`}
            checked={answer === i}
            onchange={() => (answer = i)}
            class="accent-(--accent)"
          />
          <input
            data-testid="quiz-option-input"
            type="text"
            bind:value={options[i]}
            placeholder={`alternativa ${i + 1}`}
            autocomplete="off"
            class="type-item h-(--h-button-sm) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
          />
          {#if options.length > 2}
            <button
              type="button"
              aria-label={`remover alternativa ${i + 1}`}
              onclick={() => {
                options = options.filter((_o, j) => j !== i);
                if (answer >= options.length) answer = options.length - 1;
              }}
              class="icon-btn"
            >
              <NavIcon name="x" size={11} />
            </button>
          {/if}
        </div>
      {/each}
      {#if options.length < 5}
        <button
          type="button"
          data-testid="quiz-add-option"
          onclick={() => (options = [...options, ''])}
          class="type-meta mt-2 cursor-pointer text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          + alternativa
        </button>
      {/if}
    {:else}
    <label class="type-label block text-text-low" for="card-front">frente</label>
    <textarea
      id="card-front"
      data-testid="card-front-input"
      bind:value={front}
      rows="2"
      autocomplete="off"
      placeholder="ex.: o que é controle difuso de constitucionalidade?"
      class="type-item mt-2 w-full rounded-base border border-border bg-surface p-3 text-text-body placeholder:text-text-low"
    ></textarea>

    <label class="type-label mt-3 block text-text-low" for="card-back">verso · opcional</label>
    <textarea
      id="card-back"
      data-testid="card-back-input"
      bind:value={back}
      rows="2"
      autocomplete="off"
      placeholder="ex.: o exercido por qualquer juiz ou tribunal no caso concreto."
      class="type-item mt-2 w-full rounded-base border border-border bg-surface p-3 text-text-body placeholder:text-text-low"
    ></textarea>
    {/if}

    <button
      data-testid="card-submit"
      type="submit"
      disabled={kind === 'quiz' && !quizValid}
      class="mt-3 flex h-(--h-button-md) cursor-pointer items-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <NavIcon name="plus" size={13} />
      {editingId !== null ? 'salvar questão' : kind === 'quiz' ? 'criar questão' : 'criar card'}
    </button>
  </form>
{/if}

<ul data-testid="card-list" role="list" class="mt-3 flex flex-col gap-2">
  {#each cards as card (card.id)}
    <li
      data-testid="card-item"
      class="rounded-base border border-hairline bg-bg px-3.5 py-3 whitespace-pre-wrap"
    >
      {#if card.kind === 'quiz'}
        {@const parsed = parseQuizFront(card.front_md)}
        {@const st = attemptStats.get(card.id)}
        <div class="flex items-start justify-between gap-2">
          <span class="block min-w-0 font-body text-[14px] font-medium text-text-body">
            <span class="type-label mr-1.5 text-accent">quiz</span>
            {parsed?.q ?? card.front_md}
          </span>
          <button
            data-testid="quiz-edit"
            type="button"
            aria-label="editar questão"
            title="editar questão"
            onclick={() => openEdit(card)}
            class="type-meta shrink-0 cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            editar
          </button>
        </div>
        {#if st !== undefined}
          <span
            data-testid="quiz-error-rate"
            class="mt-1 block text-[11.5px] text-text-low tabular-nums"
          >
            {st.wrong > 0
              ? `errada em ${Math.round((st.wrong / st.attempts) * 100)}% das tentativas · ${st.attempts} ${st.attempts === 1 ? 'tentativa' : 'tentativas'}`
              : `${st.attempts} ${st.attempts === 1 ? 'tentativa, nenhum erro' : 'tentativas, nenhum erro'}`}
          </span>
        {/if}
      {:else}
        <span class="block font-body text-[14px] font-medium text-text-body">{card.front_md}</span>
        {#if card.back_md !== null && card.back_md !== ''}
          <span class="mt-1 block border-t border-hairline pt-1.5 text-[12px] text-text-soft">
            {card.back_md}
          </span>
        {/if}
      {/if}
    </li>
  {/each}
</ul>

{#if cards.length === 0 && !formOpen}
  <div class="mt-3 rounded-base border border-dashed border-border px-4 py-8 text-center">
    <p class="type-item text-text-soft">
      cards viram revisões espaçadas — crie o primeiro deste tópico.
    </p>
    <button
      type="button"
      onclick={() => (formOpen = true)}
      class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-base bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      <NavIcon name="plus" size={13} />
      criar primeiro card
    </button>
  </div>
{/if}

{#if quizOpen}
  <TopicQuiz cards={quizCards} {trackId} topicId={topic.id} onClose={() => (quizOpen = false)} />
{/if}
