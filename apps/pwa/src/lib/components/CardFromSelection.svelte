<script lang="ts">
  // Modal editor for a card born from a text selection: suggested front,
  // back prefilled with the excerpt + source, one-click cloze.
  import { makeCloze, suggestCardFront } from '@studyos/core';
  import { createCard, getOrCreateDeviceId } from '@studyos/db';
  import type { CardSourceRef } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { showToast } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
  import SelectSearch, { type SelectOption } from '$lib/components/SelectSearch.svelte';

  let {
    quote,
    source,
    topicId = null,
    topicOptions = [],
    onClose,
  }: {
    quote: string;
    source: CardSourceRef;
    /** inherited topic (content attached to a topic) — locks the picker */
    topicId?: string | null;
    /** flattened "trilha · tópico" options when the topic must be chosen */
    topicOptions?: SelectOption[];
    onClose: () => void;
  } = $props();

  let front = $state('');
  let back = $state('');
  let chosenTopic = $state('');
  let saving = $state(false);
  let isCloze = $state(false);
  let backEl = $state<HTMLTextAreaElement | null>(null);

  $effect(() => {
    front = suggestCardFront(quote);
    back = quote;
    chosenTopic = topicId ?? '';
    isCloze = false;
  });

  const sourceLine = $derived.by(() => {
    if (source.ts !== undefined) {
      const m = Math.floor(source.ts / 60);
      const s = Math.floor(source.ts % 60);
      return `vídeo · ${m}:${String(s).padStart(2, '0')}`;
    }
    return source.url ?? 'conteúdo salvo';
  });

  function applyCloze(): void {
    if (backEl === null) return;
    const start = backEl.selectionStart;
    const end = backEl.selectionEnd;
    const pair = makeCloze(back, start, end);
    if (pair === null) {
      showToast('selecione no verso o trecho que vira lacuna', 'info');
      return;
    }
    front = pair.front_md;
    back = pair.back_md;
    isCloze = true;
  }

  async function save(): Promise<void> {
    const topic = topicId ?? chosenTopic;
    if (topic === '' || front.trim() === '' || saving) return;
    saving = true;
    try {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createCard(db, deviceId, {
        topic_id: topic,
        kind: isCloze ? 'cloze' : 'basic',
        front_md: front.trim(),
        back_md: back.trim() === '' ? null : back.trim(),
        source_ref: JSON.stringify(source),
      });
      showToast('card criado — entra na próxima revisão', 'success');
      onClose();
    } catch {
      showToast('não deu para criar o card — tente de novo', 'error');
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
    aria-labelledby="card-from-selection-title"
    class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
  >
    <div class="flex items-center justify-between gap-3">
      <h2
        id="card-from-selection-title"
        class="flex items-center gap-1.5 type-label text-text-low"
      >
        <NavIcon name="plus" size={12} />
        card a partir da seleção
      </h2>
      <button type="button" aria-label="fechar" onclick={onClose} class="icon-btn">
        <NavIcon name="x" size={13} />
      </button>
    </div>

    <label class="type-label mt-4 block text-text-low" for="cfs-front">frente</label>
    <textarea
      id="cfs-front"
      data-testid="card-selection-front"
      bind:value={front}
      rows="2"
      class="type-item mt-2 w-full resize-y rounded-base border border-border bg-surface px-3 py-2 text-text-body"
    ></textarea>

    <div class="mt-3 flex items-center justify-between gap-3">
      <label class="type-label block text-text-low" for="cfs-back">verso</label>
      <button
        data-testid="card-cloze"
        type="button"
        onclick={applyCloze}
        title="transformar a seleção do verso em lacuna"
        class="type-meta cursor-pointer rounded-base border border-border px-2 py-1 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        […] lacuna
      </button>
    </div>
    <textarea
      id="cfs-back"
      data-testid="card-selection-back"
      bind:this={backEl}
      bind:value={back}
      rows="4"
      class="type-item mt-2 w-full resize-y rounded-base border border-border bg-surface px-3 py-2 text-text-body"
    ></textarea>
    <p class="type-meta mt-1.5 truncate text-text-low">fonte: {sourceLine}</p>

    {#if topicId === null}
      <p class="type-label mt-3 block text-text-low">tópico</p>
      <div class="mt-2">
        <SelectSearch
          options={topicOptions}
          bind:value={chosenTopic}
          testid="card-selection-topic"
          ariaLabel="tópico do card"
          placeholder="escolha um tópico"
        />
      </div>
    {/if}

    <button
      data-testid="card-selection-save"
      type="submit"
      disabled={saving || front.trim() === '' || (topicId === null && chosenTopic === '')}
      onclick={() => void save()}
      class="mt-4 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <NavIcon name="plus" size={14} />
      criar card
    </button>
  </div>
</div>
