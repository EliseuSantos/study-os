<script lang="ts">
  // Caderno de erros: uma questão errada vira card kind='error' agendado pelo
  // FSRS — o erro volta como revisão em vez de evaporar.
  import { createCard, getOrCreateDeviceId } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { flatTopicOptions } from '$lib/stores/annotations.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
  import SelectSearch, { type SelectOption } from '$lib/components/SelectSearch.svelte';

  let {
    topicId = null,
    onClose,
    onSaved,
  }: {
    /** pre-selected topic (e.g. coming from a study session) */
    topicId?: string | null;
    onClose: () => void;
    onSaved?: () => void;
  } = $props();

  let question = $state('');
  let answer = $state('');
  let comment = $state('');
  let chosenTopic = $state('');
  let topicOptions = $state<SelectOption[]>([]);
  let saving = $state(false);

  $effect(() => {
    chosenTopic = topicId ?? '';
    void flatTopicOptions().then((opts) => (topicOptions = opts));
  });

  async function save(): Promise<void> {
    const topic = chosenTopic;
    if (topic === '' || question.trim() === '' || answer.trim() === '' || saving) return;
    saving = true;
    try {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      const back =
        comment.trim() === ''
          ? answer.trim()
          : `${answer.trim()}\n\n_${comment.trim()}_`;
      await createCard(db, deviceId, {
        topic_id: topic,
        kind: 'error',
        front_md: question.trim(),
        back_md: back,
        source_ref: JSON.stringify({ kind: 'error' }),
      });
      showToast('erro salvo — vira revisão', 'success');
      question = '';
      answer = '';
      comment = '';
      onSaved?.();
    } catch {
      showToast('não deu para salvar o erro — tente de novo', 'error');
    } finally {
      saving = false;
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose();
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
    aria-labelledby="error-log-title"
    class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="error-log-title" class="flex items-center gap-1.5 type-label text-text-low">
        <NavIcon name="x" size={12} />
        registrar erro
      </h2>
      <button type="button" aria-label="fechar" onclick={onClose} class="icon-btn">
        <NavIcon name="x" size={13} />
      </button>
    </div>

    <form
      data-testid="error-log-form"
      class="mt-3"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label class="type-label block text-text-low" for="error-question">
        a questão (enunciado ou o que você errou)
      </label>
      <textarea
        id="error-question"
        data-testid="error-question-input"
        bind:value={question}
        rows="3"
        placeholder="cole ou resuma a questão que você errou"
        class="type-item mt-2 w-full resize-y rounded-base border border-border bg-surface px-3 py-2 text-text-body placeholder:text-text-low"
      ></textarea>

      <label class="type-label mt-3 block text-text-low" for="error-answer">resposta correta</label>
      <textarea
        id="error-answer"
        data-testid="error-answer-input"
        bind:value={answer}
        rows="2"
        class="type-item mt-2 w-full resize-y rounded-base border border-border bg-surface px-3 py-2 text-text-body"
      ></textarea>

      <label class="type-label mt-3 block text-text-low" for="error-comment">
        por que errei · opcional
      </label>
      <input
        id="error-comment"
        data-testid="error-comment-input"
        type="text"
        bind:value={comment}
        placeholder="ex.: confundi prazo em dobro com prazo em quádruplo"
        class="type-item mt-2 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
      />

      {#if topicId === null}
        <p class="type-label mt-3 block text-text-low">trilha · tópico</p>
        <div class="mt-2">
          <SelectSearch
            options={topicOptions}
            bind:value={chosenTopic}
            testid="error-topic-select"
            ariaLabel="tópico do erro"
            placeholder="escolha um tópico"
          />
        </div>
      {/if}

      <button
        data-testid="error-log-submit"
        type="submit"
        disabled={saving || question.trim() === '' || answer.trim() === '' || chosenTopic === ''}
        class="mt-4 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        salvar erro
      </button>
      <p class="type-meta mt-3 text-center text-text-low">
        o erro entra na fila de revisão — errar aqui é estudar.
      </p>
    </form>
  </div>
</div>
