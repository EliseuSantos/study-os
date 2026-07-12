<script lang="ts">
  import WhyNote from '$lib/components/WhyNote.svelte';
  function extractVideoId(url: string): string {
    return /[?&]v=([A-Za-z0-9_-]{5,20})/.exec(url)?.[1] ?? '';
  }
  function shortUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname === '/' ? '' : u.pathname).slice(0, 40);
    } catch {
      return url.slice(0, 40);
    }
  }
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

  const total = $derived(store.remaining + store.done);
  const donePct = $derived(total === 0 ? 0 : Math.round((store.done / total) * 100));

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'z' && store.canUndo) {
      event.preventDefault();
      void store.undo();
      return;
    }
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

<div class="mx-auto w-full max-w-[720px] px-4 py-6 lg:py-10">
  <WhyNote
    flag="review"
    text="revisar no limite do esquecimento fixa mais com menos tempo — as notas 1–4 calibram o próximo encontro."
  />
  {#if !store.loading}
    {#if store.current}
      <div class="flex items-baseline justify-between gap-4">
        <div>
          <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">revisão</h1>
          <p class="type-meta mt-1 text-text-low">memória em dia, um card por vez</p>
        </div>
        <p
          data-testid="review-remaining"
          class="type-meta shrink-0 text-text-low tabular-nums"
          aria-live="polite"
        >
          {store.done + 1} de {total} · {store.remaining}
          {store.remaining === 1 ? 'restante' : 'restantes'}
        </p>
      </div>

      <div class="mt-4 h-1 rounded-[2px] bg-hairline" aria-hidden="true">
        <span
          class="block h-1 rounded-[2px] bg-accent transition-[width] duration-(--dur-slow) ease-brand"
          style="width:{donePct}%"
        ></span>
      </div>

      <div
        data-testid="review-card"
        class="mt-6 rounded-panel border border-hairline bg-surface px-6 py-8 lg:px-10 lg:py-10"
      >
        <p class="type-label text-text-low">
          {store.current.refKind === 'card' ? 'card' : 'tópico'}
        </p>
        <p data-testid="review-front" class="review-flashcard mt-4 text-text-hi">
          {store.current.title}
        </p>

        {#if store.revealed}
          <div class="mt-8 border-t border-hairline pt-6">
            <p
              data-testid="review-back"
              class="review-answer {store.back === null ? 'text-text-soft' : 'text-text-reading'}"
            >
              {store.back ?? 'avalie de memória'}
            </p>
            {#if store.source !== null}
              <p class="type-meta mt-2 truncate text-text-low">
                fonte:
                {#if store.source.ts !== undefined}
                  <a
                    data-testid="review-source"
                    href={store.source.content_item_id !== undefined
                      ? `/library/watch/${extractVideoId(store.source.url ?? '')}?t=${Math.floor(store.source.ts)}`
                      : (store.source.url ?? '#')}
                    class="text-text-mid underline decoration-hairline underline-offset-2 hover:decoration-current"
                  >
                    vídeo · {Math.floor(store.source.ts / 60)}:{String(
                      Math.floor(store.source.ts % 60),
                    ).padStart(2, '0')}
                  </a>
                {:else if store.source.url !== undefined}
                  <a
                    data-testid="review-source"
                    href={`/library/read?url=${encodeURIComponent(store.source.url)}`}
                    class="text-text-mid underline decoration-hairline underline-offset-2 hover:decoration-current"
                  >
                    {shortUrl(store.source.url)}
                  </a>
                {/if}
              </p>
            {/if}
          </div>

          <div
            class="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="group"
            aria-label="avaliar lembrança"
          >
            {#each ratings as rating (rating.value)}
              <button
                data-testid={`rating-${rating.value}`}
                type="button"
                onclick={() => void store.rate(rating.value)}
                class="flex cursor-pointer flex-col items-center gap-1.5 rounded-base border px-2 py-3.5 transition-colors duration-(--dur-base) ease-brand {rating.value ===
                1
                  ? 'border-border text-text-mid hover:text-text-hi'
                  : 'border-accent-dim bg-(--accent-tint-08) text-text-hi hover:bg-(--accent-tint-12)'}"
              >
                <kbd
                  class="rounded-micro border border-border px-1.5 py-0.5 text-[10px] text-text-low"
                  aria-hidden="true"
                >
                  {rating.value}
                </kbd>
                <span class="text-[13.5px] font-semibold">{rating.label}</span>
                {#if store.intervals !== null}
                  <span class="text-[10.5px] text-text-low tabular-nums">
                    {store.intervals[rating.value]}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
          {#if store.canUndo}
            <button
              data-testid="review-undo"
              type="button"
              onclick={() => void store.undo()}
              class="type-meta mx-auto mt-4 block cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
            >
              desfazer última avaliação · <kbd class="kbd">z</kbd>
            </button>
          {/if}
        {:else}
          <button
            data-testid="review-reveal"
            type="button"
            onclick={() => store.reveal()}
            class="mt-10 h-(--h-button-md) w-full cursor-pointer rounded-base border border-border text-[13px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:border-text-low hover:text-text-hi"
          >
            mostrar resposta
          </button>
          {#if store.canUndo}
            <button
              data-testid="review-undo"
              type="button"
              onclick={() => void store.undo()}
              class="type-meta mx-auto mt-4 block cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
            >
              desfazer última avaliação · <kbd class="kbd">z</kbd>
            </button>
          {/if}
        {/if}
      </div>

      <p class="type-meta mt-4 text-center text-text-low">
        <kbd class="kbd">espaço</kbd> revela · <kbd class="kbd">1</kbd>–<kbd class="kbd">4</kbd>
        avaliam
      </p>
    {:else}
      <div class="py-10 text-center">
        <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">revisão</h1>
        <div
          data-testid="review-empty"
          class="mx-auto mt-8 max-w-md rounded-panel border border-hairline bg-surface px-6 py-10"
        >
          <span class="done-ring" aria-hidden="true">✓</span>
          <p class="type-item mt-4 text-text-body">revisões em dia.</p>
          <p class="type-meta mt-1 text-text-soft">a memória agradece — volte amanhã.</p>
          {#if store.canUndo}
            <button
              data-testid="review-undo"
              type="button"
              onclick={() => void store.undo()}
              class="type-meta mt-4 block w-full cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
            >
              desfazer última avaliação · <kbd class="kbd">z</kbd>
            </button>
          {/if}
          <a
            href="/"
            class="type-meta mt-6 inline-flex h-(--h-button-sm) items-center rounded-base border border-border px-4 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            voltar ao hoje
          </a>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .review-flashcard {
    font: var(--type-flashcard);
  }

  .review-answer {
    font: var(--type-item);
    line-height: 1.65;
  }

  .kbd {
    border: 1px solid var(--border);
    border-radius: var(--radius-micro);
    padding: 1px 5px;
    font-size: 10px;
    color: var(--text-low);
  }

  .done-ring {
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 2px solid var(--success);
    color: var(--success);
    font-size: 22px;
  }
</style>
