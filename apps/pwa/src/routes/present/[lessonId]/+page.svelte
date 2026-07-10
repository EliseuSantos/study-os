<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import {
    createPresentStore,
    formatElapsed,
    parseQuiz,
    type PresentStore,
  } from '$lib/stores/present.svelte';
  import Slide from './Slide.svelte';

  const lessonId = $derived(page.params.lessonId ?? '');

  let store = $state.raw<PresentStore | null>(null);
  let stageEl = $state<HTMLElement | null>(null);

  $effect(() => {
    const next = createPresentStore(lessonId);
    untrack(() => {
      store = next;
    });
    void next.load();
    return () => next.destroy();
  });

  async function startPresenting(): Promise<void> {
    store?.start();
    await tick(); // the stage element must exist before we can go fullscreen
    const el = stageEl;
    if (el === null) return;
    try {
      await el.requestFullscreen();
    } catch {
      // Fullscreen denied — the stage's fixed inset-0 layout is the fallback.
    }
  }

  function exitPresenting(): void {
    if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
    store?.exit();
  }

  function onkeydown(event: KeyboardEvent): void {
    if (store === null || !store.presenting) return;
    if (event.key === 'Escape') {
      exitPresenting();
      return;
    }
    // Space on a focused button is that button's native click (quiz options).
    if (event.key === ' ' && event.target instanceof HTMLButtonElement) return;
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      store.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      store.prev();
    }
  }

  // Esc inside native fullscreen exits fullscreen without a keydown we can
  // catch — mirror that into the store so the pre-stage screen comes back.
  function onfullscreenchange(): void {
    if (store !== null && store.presenting && document.fullscreenElement === null) store.exit();
  }

  // Tap zones: right half advances, left half goes back. Attached imperatively
  // so real controls (buttons, links, the embed) keep their own clicks.
  $effect(() => {
    const el = stageEl;
    const s = store;
    if (el === null || s === null || !s.presenting) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, iframe, input') !== null) return;
      if (event.clientX >= window.innerWidth / 2) s.next();
      else s.prev();
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  });

  const KIND_LABELS: Record<string, string> = {
    topic: 'tópico',
    content: 'conteúdo',
    quiz: 'quiz',
    note: 'nota',
  };

  function nextPreview(s: PresentStore): string {
    const next = s.items[s.index + 1];
    if (next === undefined) return 'fim';
    const label = KIND_LABELS[next.kind] ?? next.kind;
    let text: string | null = null;
    if (next.kind === 'topic' && next.topic_id !== null) {
      text = s.topics.get(next.topic_id)?.title ?? null;
    } else if (next.kind === 'content' && next.content_item_id !== null) {
      text = s.content.get(next.content_item_id)?.title ?? null;
    } else if (next.kind === 'quiz') {
      text = parseQuiz(next.body_md)?.q ?? next.body_md;
    } else {
      text = next.body_md;
    }
    const preview = (text ?? '').replace(/\s+/g, ' ').trim();
    if (preview === '') return label;
    return `${label} — ${preview.length > 80 ? `${preview.slice(0, 80)}…` : preview}`;
  }

  function notesParagraphs(md: string | null): string[] {
    return (md ?? '')
      .split(/\n{2,}/)
      .map((p) => p.trim().replace(/\n/g, ' '))
      .filter((p) => p !== '');
  }
</script>

<svelte:head>
  <title>StudyOS — apresentação</title>
</svelte:head>

<svelte:window {onkeydown} />
<svelte:document {onfullscreenchange} />

{#if store !== null}
  {#if store.status === 'loading'}
    <section class="mx-auto w-full max-w-2xl px-4 py-8">
      <p class="type-item text-text-soft">carregando…</p>
    </section>
  {:else if store.status === 'notfound' || store.lesson === null}
    <section class="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 class="type-h1 text-text-hi">aula não encontrada.</h1>
      <p class="type-item mt-4 text-text-soft">
        talvez ela tenha sido removida ou o endereço esteja errado.
      </p>
    </section>
  {:else if !store.presenting}
    <section class="mx-auto w-full max-w-2xl px-4 py-8">
      <p class="type-label text-text-low">apresentação</p>
      <h1 class="type-h1 mt-2 text-text-hi">{store.lesson.title}</h1>
      <p class="type-meta mt-3 text-text-mid">
        {store.items.length}
        {store.items.length === 1 ? 'item' : 'itens'}
      </p>

      <button
        data-testid="present-start"
        type="button"
        disabled={store.items.length === 0}
        onclick={() => void startPresenting()}
        class="mt-8 inline-flex h-(--h-button-md) cursor-pointer items-center rounded-base bg-accent px-6 text-[16px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-default disabled:opacity-40"
      >
        apresentar
      </button>

      {#if store.items.length === 0}
        <p class="type-item mt-4 text-text-soft">esta aula ainda não tem itens.</p>
      {/if}
    </section>
  {:else}
    {@const item = store.items[store.index]}
    <div bind:this={stageEl} class="fixed inset-0 z-50 flex flex-col bg-bg-deep">
      <header class="flex items-center justify-between px-6 pt-5">
        <button
          data-testid="presenter-toggle"
          type="button"
          aria-pressed={store.presenterMode}
          onclick={() => store?.togglePresenter()}
          class="type-meta cursor-pointer rounded-micro border px-3 py-1.5 transition-colors duration-(--dur-base) ease-brand {store.presenterMode
            ? 'border-border bg-surface-2 text-text-hi'
            : 'border-border text-text-mid hover:text-text-hi'}"
        >
          modo apresentador
        </button>
        <button
          data-testid="present-exit"
          type="button"
          aria-label="sair da apresentação"
          onclick={exitPresenting}
          class="type-meta cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
        >
          esc — sair
        </button>
      </header>

      {#if item !== undefined}
        {#if store.presenterMode}
          <div class="flex min-h-0 flex-1 items-stretch gap-6 p-6">
            <div
              class="flex min-w-0 flex-[3] items-center justify-center overflow-hidden rounded-base border border-hairline px-8"
            >
              <Slide
                {item}
                topics={store.topics}
                content={store.content}
                picked={store.picks[item.id]}
                onpick={(option) => store?.pick(item.id, option)}
                compact
              />
            </div>
            <aside class="flex w-[320px] shrink-0 flex-col gap-8 overflow-y-auto py-2">
              <div>
                <p class="type-label text-text-low">tempo</p>
                <p
                  data-testid="presenter-timer"
                  class="mt-2 font-display text-[32px] leading-none font-medium tracking-[-0.01em] text-text-hi tabular-nums"
                >
                  {formatElapsed(store.elapsed)}
                </p>
              </div>
              <div>
                <p class="type-label text-text-low">notas</p>
                <div data-testid="presenter-notes" class="mt-3 flex flex-col gap-3">
                  {#each notesParagraphs(store.lesson.presenter_notes_md) as p, i (i)}
                    <p class="font-body text-[15.5px] leading-[1.65] text-text-mid">{p}</p>
                  {:else}
                    <p class="type-meta text-text-low">sem notas.</p>
                  {/each}
                </div>
              </div>
              <div>
                <p class="type-label text-text-low">próximo</p>
                <p data-testid="presenter-next" class="type-item mt-3 text-text-soft">
                  {nextPreview(store)}
                </p>
              </div>
            </aside>
          </div>
        {:else}
          <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-[6vw]">
            <Slide
              {item}
              topics={store.topics}
              content={store.content}
              picked={store.picks[item.id]}
              onpick={(option) => store?.pick(item.id, option)}
            />
          </div>
        {/if}
      {/if}

      <footer class="flex items-center justify-end px-6 pb-5">
        <p data-testid="slide-index" class="type-meta text-text-low tabular-nums">
          {store.index + 1} · {store.items.length}
        </p>
      </footer>
    </div>
  {/if}
{/if}
