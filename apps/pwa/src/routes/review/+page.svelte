<script lang="ts">
  import { onMount } from 'svelte';
  import { createReviewStore, type Rating } from '$lib/stores/review.svelte';

  const store = createReviewStore();

  onMount(() => {
    void store.load();
  });

  const ratings: { value: Rating; label: string }[] = [
    { value: 1, label: 'errei' },
    { value: 2, label: 'difícil' },
    { value: 3, label: 'bom' },
    { value: 4, label: 'fácil' },
  ];

  function onkeydown(event: KeyboardEvent) {
    if (!store.current) return;
    if (!store.revealed) {
      if (event.key === ' ' || event.key === 'Enter') {
        // A focused button already reveals via its native click.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        store.reveal();
      }
      return;
    }
    if (event.key === '1' || event.key === '2' || event.key === '3' || event.key === '4') {
      event.preventDefault();
      void store.rate(Number(event.key) as Rating);
    }
  }
</script>

<svelte:head>
  <title>StudyOS — revisão</title>
</svelte:head>

<svelte:window {onkeydown} />

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">revisão</p>
  <h1 class="type-h1 mt-2 text-text-hi">memória em dia</h1>

  {#if !store.loading}
    {#if store.current}
      <p data-testid="review-remaining" class="type-meta mt-6 text-text-low" aria-live="polite">
        {store.remaining}
        {store.remaining === 1 ? 'restante' : 'restantes'}
      </p>

      <div
        data-testid="review-card"
        class="mt-3 rounded-base border border-hairline bg-surface p-6"
      >
        <p data-testid="review-front" class="review-flashcard text-text-hi">
          {store.current.title}
        </p>

        {#if store.revealed}
          <div class="mt-6 border-t border-hairline pt-6">
            <p
              data-testid="review-back"
              class="review-answer {store.back === null ? 'text-text-soft' : 'text-text-body'}"
            >
              {store.back ?? 'avalie de memória'}
            </p>
          </div>

          <div class="mt-8 grid grid-cols-4 gap-2" role="group" aria-label="avaliar lembrança">
            {#each ratings as rating (rating.value)}
              <button
                data-testid={`rating-${rating.value}`}
                type="button"
                onclick={() => void store.rate(rating.value)}
                class="flex cursor-pointer flex-col items-center gap-1.5 rounded-base border px-2 py-3 transition-colors duration-(--dur-base) ease-brand {rating.value ===
                1
                  ? 'border-border text-text-mid hover:text-text-hi'
                  : 'border-accent-dim bg-(--accent-tint-08) text-text-hi'}"
              >
                <span class="type-meta text-text-low" aria-hidden="true">{rating.value}</span>
                <span class="text-[13px] font-semibold">{rating.label}</span>
              </button>
            {/each}
          </div>
        {:else}
          <button
            data-testid="review-reveal"
            type="button"
            onclick={() => store.reveal()}
            class="mt-8 h-(--h-button-md) w-full cursor-pointer rounded-base border border-border text-[13px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            mostrar resposta
          </button>
        {/if}
      </div>

      <p class="type-meta mt-4 text-text-low">espaço revela · 1–4 avaliam</p>
    {:else}
      <div data-testid="review-empty" class="mt-8">
        <p class="type-item text-text-soft">revisões em dia.</p>
        <a
          href="/"
          class="type-meta mt-4 inline-flex h-(--h-button-sm) items-center rounded-base border border-border px-4 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          voltar ao hoje
        </a>
      </div>
    {/if}
  {/if}
</section>

<style>
  .review-flashcard {
    font: var(--type-flashcard);
  }

  .review-answer {
    font: var(--type-item);
  }
</style>
