<script lang="ts">
  import type { CardRow, TopicRow } from '@studyos/shared';

  let {
    topic,
    cards,
    onadd,
  }: {
    topic: TopicRow;
    cards: CardRow[];
    onadd: (front: string, back: string) => Promise<void>;
  } = $props();

  let front = $state('');
  let back = $state('');

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    const frontValue = front.trim();
    if (!frontValue) return;
    const backValue = back;
    front = '';
    back = '';
    void onadd(frontValue, backValue);
  }
</script>

<h2 class="type-label text-text-low">cards · {topic.title}</h2>

<form data-testid="card-form" class="mt-4" {onsubmit}>
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
    class="mt-3 h-(--h-button-md) cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
  >
    criar card
  </button>
</form>

<ul data-testid="card-list" role="list" class="mt-6">
  {#each cards as card (card.id)}
    <li
      data-testid="card-item"
      class="type-item border-b border-hairline py-3 whitespace-pre-wrap text-text-body first:border-t"
    >
      {card.front_md}
    </li>
  {/each}
</ul>

{#if cards.length === 0}
  <p class="type-item mt-2 text-text-soft">nenhum card ainda — crie o primeiro.</p>
{/if}
