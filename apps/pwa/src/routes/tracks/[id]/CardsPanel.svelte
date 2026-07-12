<script lang="ts">
  import type { CardRow, TopicRow } from '@studyos/shared';
  import NavIcon from '$lib/components/NavIcon.svelte';
  import TopicQuiz from './TopicQuiz.svelte';

  let {
    topic,
    cards,
    trackId,
    onadd,
  }: {
    topic: TopicRow;
    cards: CardRow[];
    trackId: string;
    onadd: (front: string, back: string) => Promise<void>;
  } = $props();

  const quizCards = $derived(cards.filter((c) => c.kind === 'quiz'));
  let quizOpen = $state(false);

  let front = $state('');
  let back = $state('');
  let formOpen = $state(false);

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    const frontValue = front.trim();
    if (!frontValue) return;
    const backValue = back;
    front = '';
    back = '';
    formOpen = false;
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

    <button
      data-testid="card-submit"
      type="submit"
      class="mt-3 flex h-(--h-button-md) cursor-pointer items-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      <NavIcon name="plus" size={13} />
      criar card
    </button>
  </form>
{/if}

<ul data-testid="card-list" role="list" class="mt-3 flex flex-col gap-2">
  {#each cards as card (card.id)}
    <li
      data-testid="card-item"
      class="rounded-base border border-hairline bg-bg px-3.5 py-3 whitespace-pre-wrap"
    >
      <span class="block font-body text-[14px] font-medium text-text-body">{card.front_md}</span>
      {#if card.back_md !== null && card.back_md !== ''}
        <span class="mt-1 block border-t border-hairline pt-1.5 text-[12px] text-text-soft">
          {card.back_md}
        </span>
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
