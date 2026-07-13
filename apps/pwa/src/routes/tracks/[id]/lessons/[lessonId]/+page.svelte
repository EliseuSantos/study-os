<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { getOrCreateDeviceId, listContentByTopic, updateLessonItem } from '@studyos/db';
  import type { ContentItemRow, LessonItemRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { createLessonEditorStore, type LessonEditorStore } from '$lib/stores/lessons.svelte';
  import { showToast } from '$lib/stores/toast.svelte';

  const trackId = $derived(page.params.id ?? '');
  const lessonId = $derived(page.params.lessonId ?? '');

  let store = $state.raw<LessonEditorStore | null>(null);

  // Local drafts for lesson fields: hydrated once per lesson so liveQuery refreshes
  // (our own debounced saves echoing back) never clobber in-progress typing.
  let notes = $state('');
  let durationVal = $state<number | null>(null);
  let hydratedLessonId = $state<string | null>(null);

  $effect(() => {
    const next = createLessonEditorStore(trackId, lessonId);
    untrack(() => {
      store = next;
      notes = '';
      durationVal = null;
      hydratedLessonId = null;
    });
    return () => next.destroy();
  });

  const lesson = $derived(store?.lesson ?? null);
  const lessonLoaded = $derived(store?.lessonLoaded ?? false);
  const items = $derived(store?.items ?? []);
  const topics = $derived(store?.topics ?? []);
  const topicTitleById = $derived(new Map(topics.map((t) => [t.id, t.title])));

  $effect(() => {
    const current = lesson;
    if (current === null || hydratedLessonId === current.id) return;
    untrack(() => {
      hydratedLessonId = current.id;
      notes = current.presenter_notes_md ?? '';
      durationVal = current.estimated_duration_min;
    });
  });

  function onNotesInput(event: Event & { currentTarget: HTMLTextAreaElement }) {
    notes = event.currentTarget.value;
    store?.updateNotes(notes);
  }

  function onDurationInput(event: Event & { currentTarget: HTMLInputElement }) {
    const el = event.currentTarget;
    if (el.value === '') {
      durationVal = null;
      store?.updateDuration(null);
      return;
    }
    const n = el.valueAsNumber;
    if (Number.isNaN(n)) return; // mid-edit invalid value — keep last persisted one
    durationVal = Math.max(1, Math.round(n));
    store?.updateDuration(durationVal);
  }

  const KIND_LABEL: Record<string, string> = {
    topic: 'tópico',
    content: 'conteúdo',
    quiz: 'quiz',
    note: 'nota',
  };

  function preview(item: LessonItemRow): string {
    if (item.kind === 'topic') {
      return (item.topic_id !== null && topicTitleById.get(item.topic_id)) || 'tópico removido';
    }
    if (item.kind === 'content') return '(conteúdo)';
    if (item.kind === 'quiz') {
      if (item.body_md === null) return '(quiz)';
      try {
        const parsed = JSON.parse(item.body_md) as { q?: unknown };
        return typeof parsed.q === 'string' && parsed.q !== '' ? parsed.q : '(quiz)';
      } catch {
        return '(quiz)';
      }
    }
    const text = (item.body_md ?? '').trim();
    if (text === '') return '(nota)';
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }

  // --- add item form ---
  type ItemKind = 'topic' | 'content' | 'quiz' | 'note';
  let itemKind = $state<ItemKind>('topic');
  let itemTopicId = $state('');
  let itemContentId = $state('');
  let noteBody = $state('');
  let quizQuestion = $state('');
  let quizOptions = $state('');
  let quizAnswer = $state<number | null>(null);

  let contentOptions = $state<ContentItemRow[]>([]);

  $effect(() => {
    const kind = itemKind;
    const topicId = itemTopicId;
    untrack(() => {
      contentOptions = [];
      itemContentId = '';
    });
    if (kind !== 'content' || topicId === '') return;
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await listContentByTopic(db, topicId);
      if (!cancelled) contentOptions = rows;
    })();
    return () => {
      cancelled = true;
    };
  });

  function onQuizAnswerInput(event: Event & { currentTarget: HTMLInputElement }) {
    const n = event.currentTarget.valueAsNumber;
    quizAnswer = Number.isNaN(n) ? null : Math.round(n);
  }

  const quizOptionList = $derived(
    quizOptions
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
  );
  const quizValid = $derived(
    quizQuestion.trim() !== '' &&
      quizOptionList.length >= 2 &&
      quizAnswer !== null &&
      quizAnswer >= 1 &&
      quizAnswer <= quizOptionList.length,
  );
  const canSubmit = $derived(
    itemKind === 'topic'
      ? itemTopicId !== ''
      : itemKind === 'content'
        ? itemTopicId !== '' && itemContentId !== ''
        : itemKind === 'note'
          ? noteBody.trim() !== ''
          : quizValid,
  );

  async function onAddItem(event: SubmitEvent) {
    event.preventDefault();
    const editor = store;
    if (editor === null || !canSubmit) return;
    if (itemKind === 'topic') {
      await editor.addItem({ kind: 'topic', topic_id: itemTopicId });
    } else if (itemKind === 'content') {
      await editor.addItem({
        kind: 'content',
        topic_id: itemTopicId,
        content_item_id: itemContentId,
      });
    } else if (itemKind === 'note') {
      await editor.addItem({ kind: 'note', body_md: noteBody.trim() });
    } else if (quizAnswer !== null) {
      // quiz-answer-input is 1-based for humans; body_md stores the 0-based index
      // into options (templates/README.md is the format contract).
      const body = JSON.stringify({
        q: quizQuestion.trim(),
        options: quizOptionList,
        answer: quizAnswer - 1,
      });
      await editor.addItem({ kind: 'quiz', body_md: body });
    }
    itemTopicId = '';
    itemContentId = '';
    noteBody = '';
    quizQuestion = '';
    quizOptions = '';
    quizAnswer = null;
  }

  const fieldClass =
    'type-item mt-2 w-full rounded-base border border-border bg-surface p-3 text-text-body placeholder:text-text-low';
  const selectClass =
    'type-item mt-2 h-(--h-button-md) w-full cursor-pointer rounded-base border border-border bg-surface px-3 text-text-body';
  const moveButtonClass =
    'type-meta shrink-0 cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-default disabled:opacity-40 disabled:hover:text-text-low';

  // roteiro do apresentador por item — só o professor vê
  let notesFor = $state<string | null>(null);
  let notesDraft = $state('');

  function openNotes(item: LessonItemRow): void {
    if (notesFor === item.id) {
      notesFor = null;
      return;
    }
    notesFor = item.id;
    notesDraft = item.presenter_notes_md ?? '';
  }

  async function saveNotes(): Promise<void> {
    const id = notesFor;
    if (id === null) return;
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await updateLessonItem(db, deviceId, id, {
      presenter_notes_md: notesDraft.trim() === '' ? null : notesDraft.trim(),
    });
    await store?.refreshItems();
    notesFor = null;
    showToast('roteiro salvo — visível só na sua apresentação', 'success');
  }
</script>

<svelte:head>
  <title>StudyOS — {lesson?.title ?? 'aula'}</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <a
    href={`/tracks/${trackId}`}
    class="type-meta text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
  >
    ← trilha
  </a>

  {#if !lessonLoaded}
    <p class="type-item mt-6 text-text-soft">carregando…</p>
  {:else if lesson === null}
    <h1 class="type-h1 mt-6 text-text-hi">aula não encontrada.</h1>
    <p class="type-item mt-4 text-text-soft">
      talvez ela tenha sido removida ou o endereço esteja errado.
      <a
        href={`/tracks/${trackId}`}
        class="text-text-mid underline underline-offset-2 hover:text-text-hi"
      >
        voltar à trilha
      </a>
    </p>
  {:else}
    <p class="type-label mt-6 text-text-low">aula</p>
    <div class="mt-2 flex flex-wrap items-center justify-between gap-4">
      <h1 class="type-h1 min-w-0 text-text-hi">{lesson.title}</h1>
      <a
        data-testid="present-link"
        href={`/present/${lessonId}`}
        class="inline-flex h-(--h-button-md) shrink-0 items-center rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        apresentar →
      </a>
    </div>

    <div data-testid="lesson-editor" class="mt-8">
      <label class="type-label block text-text-low" for="lesson-notes">
        notas do apresentador
      </label>
      <textarea
        id="lesson-notes"
        data-testid="lesson-notes-input"
        rows="4"
        autocomplete="off"
        value={notes}
        oninput={onNotesInput}
        onblur={() => store?.flush()}
        placeholder="ex.: lembrar de citar o caso concreto antes do quiz."
        class={fieldClass}></textarea>

      <label class="type-label mt-4 block text-text-low" for="lesson-duration">
        duração em minutos · opcional
      </label>
      <input
        id="lesson-duration"
        data-testid="lesson-duration-input"
        type="number"
        min="1"
        value={durationVal ?? ''}
        oninput={onDurationInput}
        onblur={() => store?.flush()}
        class="type-item mt-2 h-(--h-button-md) w-24 rounded-base border border-border bg-surface px-2 text-text-body tabular-nums"
      />

      <h2 class="type-label mt-10 text-text-low">
        itens{items.length > 0 ? ` · ${items.length}` : ''}
      </h2>

      <ul data-testid="lesson-items" role="list" class="mt-4">
        {#each items as item, index (item.id)}
          <li
            data-testid="lesson-item"
            class="flex items-center gap-3 border-b border-hairline py-3 first:border-t"
          >
            <span
              class="type-meta w-20 shrink-0 rounded-base border border-border px-2 py-0.5 text-center text-text-low"
            >
              {KIND_LABEL[item.kind] ?? item.kind}
            </span>
            <span class="type-item min-w-0 flex-1 truncate text-text-body">{preview(item)}</span>
            <button
              data-testid="item-notes-toggle"
              type="button"
              aria-expanded={notesFor === item.id}
              title={item.presenter_notes_md === null ? 'adicionar roteiro' : 'editar roteiro'}
              onclick={() => openNotes(item)}
              class="type-meta shrink-0 cursor-pointer {item.presenter_notes_md === null
                ? 'text-text-low'
                : 'text-accent'} transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
            >
              roteiro
            </button>
            <button
              data-testid="lesson-item-up"
              type="button"
              aria-label="mover item para cima"
              disabled={index === 0}
              onclick={() => void store?.move(item, -1)}
              class={moveButtonClass}
            >
              subir
            </button>
            <button
              data-testid="lesson-item-down"
              type="button"
              aria-label="mover item para baixo"
              disabled={index === items.length - 1}
              onclick={() => void store?.move(item, 1)}
              class={moveButtonClass}
            >
              descer
            </button>
            <button
              data-testid="lesson-item-delete"
              type="button"
              aria-label="remover item"
              onclick={() => void store?.removeItem(item.id)}
              class="shrink-0 cursor-pointer leading-none text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
            >
              ×
            </button>
          </li>
        {/each}
      </ul>

      {#if notesFor !== null}
        <div class="mt-3 rounded-base border border-hairline bg-bg p-3.5">
          <label class="type-label block text-text-low" for="item-notes">
            roteiro deste slide — visível só na sua apresentação
          </label>
          <textarea
            id="item-notes"
            data-testid="item-notes-input"
            bind:value={notesDraft}
            rows="3"
            placeholder="lembretes, exemplos, o que falar…"
            class="type-item mt-2 w-full resize-y rounded-base border border-border bg-surface px-3 py-2 text-text-body placeholder:text-text-low"
          ></textarea>
          <button
            data-testid="item-notes-save"
            type="button"
            onclick={() => void saveNotes()}
            class="type-meta mt-2 cursor-pointer rounded-base border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            salvar roteiro
          </button>
        </div>
      {/if}

      {#if items.length === 0}
        <p class="type-item mt-2 text-text-soft">nenhum item ainda — adicione o primeiro.</p>
      {/if}

      <form class="mt-6" onsubmit={onAddItem}>
        <label class="type-label block text-text-low" for="item-kind">novo item</label>
        <select
          id="item-kind"
          data-testid="item-kind-select"
          bind:value={itemKind}
          class={selectClass}
        >
          <option value="topic">tópico</option>
          <option value="content">conteúdo</option>
          <option value="quiz">quiz</option>
          <option value="note">nota</option>
        </select>

        {#if itemKind === 'topic' || itemKind === 'content'}
          <label class="type-label mt-3 block text-text-low" for="item-topic">tópico</label>
          <select
            id="item-topic"
            data-testid="item-topic-select"
            bind:value={itemTopicId}
            class={selectClass}
          >
            <option value="">escolha um tópico</option>
            {#each topics as topic (topic.id)}
              <option value={topic.id}>{topic.title}</option>
            {/each}
          </select>
        {/if}

        {#if itemKind === 'content'}
          <label class="type-label mt-3 block text-text-low" for="item-content">conteúdo</label>
          <select
            id="item-content"
            data-testid="item-content-select"
            bind:value={itemContentId}
            disabled={itemTopicId === ''}
            class={selectClass}
          >
            <option value="">escolha um conteúdo</option>
            {#each contentOptions as content (content.id)}
              <option value={content.id}>{content.title}</option>
            {/each}
          </select>
          {#if itemTopicId !== '' && contentOptions.length === 0}
            <p class="type-meta mt-2 text-text-soft">nenhum conteúdo neste tópico.</p>
          {/if}
        {/if}

        {#if itemKind === 'note'}
          <label class="type-label mt-3 block text-text-low" for="item-body">
            nota · markdown
          </label>
          <textarea
            id="item-body"
            data-testid="item-body-input"
            rows="3"
            autocomplete="off"
            bind:value={noteBody}
            placeholder="ex.: pausa para dúvidas antes de seguir."
            class={fieldClass}></textarea>
        {/if}

        {#if itemKind === 'quiz'}
          <label class="type-label mt-3 block text-text-low" for="quiz-question">pergunta</label>
          <input
            id="quiz-question"
            data-testid="quiz-question-input"
            type="text"
            autocomplete="off"
            bind:value={quizQuestion}
            placeholder="ex.: qual órgão exerce o controle concentrado?"
            class="type-item mt-2 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
          />
          <label class="type-label mt-3 block text-text-low" for="quiz-options">
            opções · uma por linha, no mínimo duas
          </label>
          <textarea
            id="quiz-options"
            data-testid="quiz-options-input"
            rows="4"
            autocomplete="off"
            bind:value={quizOptions}
            placeholder={'stf\nstj\ntse'}
            class={fieldClass}></textarea>
          <label class="type-label mt-3 block text-text-low" for="quiz-answer">
            resposta correta · número da opção
          </label>
          <input
            id="quiz-answer"
            data-testid="quiz-answer-input"
            type="number"
            min="1"
            max={quizOptionList.length > 0 ? quizOptionList.length : 1}
            value={quizAnswer ?? ''}
            oninput={onQuizAnswerInput}
            class="type-item mt-2 h-(--h-button-md) w-24 rounded-base border border-border bg-surface px-2 text-text-body tabular-nums"
          />
        {/if}

        <button
          data-testid="item-add-submit"
          type="submit"
          disabled={!canSubmit}
          class="mt-4 h-(--h-button-md) cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        >
          adicionar item
        </button>
      </form>
    </div>
  {/if}
</section>
