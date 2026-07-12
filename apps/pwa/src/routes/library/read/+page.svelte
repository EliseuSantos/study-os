<script lang="ts">
  import { page } from '$app/state';
  import { onDestroy, untrack } from 'svelte';
  import { makeAnchor, resolveAnchor } from '@studyos/core';
  import { attachContent, findContentByUrl, getOrCreateDeviceId } from '@studyos/db';
  import type { ContentItemRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { authedFetch } from '$lib/stores/library.svelte';
  import {
    createAnnotationsStore,
    flatTopicOptions,
    type AnnotationsStore,
    type ParsedAnnotation,
  } from '$lib/stores/annotations.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import CardFromSelection from '$lib/components/CardFromSelection.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
  import SelectionActions, {
    type SelectionInfo,
  } from '$lib/components/SelectionActions.svelte';
  import SelectSearch, { type SelectOption } from '$lib/components/SelectSearch.svelte';

  interface Article {
    url: string;
    title: string;
    markdown: string;
  }

  type Block =
    | { kind: 'heading'; level: 1 | 2 | 3; text: string; seg: number }
    | { kind: 'paragraph'; text: string; seg: number }
    | { kind: 'list'; items: { text: string; seg: number }[] };

  const target = $derived(page.url.searchParams.get('url') ?? '');

  let article = $state<Article | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  // Minimal markdown rendering — headings, paragraphs and flat lists, no lib.
  // Every rendered text element is a "segment" annotations anchor into.
  function toBlocks(markdown: string): { blocks: Block[]; segments: string[] } {
    const blocks: Block[] = [];
    const segments: string[] = [];
    const seg = (text: string): number => segments.push(text) - 1;
    for (const chunk of markdown.split(/\n{2,}/)) {
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');
      if (lines.length === 0) continue;
      const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? '');
      if (heading && lines.length === 1) {
        const text = stripInline(heading[2] ?? '');
        blocks.push({
          kind: 'heading',
          level: heading[1]?.length as 1 | 2 | 3,
          text,
          seg: seg(text),
        });
        continue;
      }
      if (lines.every((l) => /^([-*]|\d+[.)])\s+/.test(l))) {
        blocks.push({
          kind: 'list',
          items: lines.map((l) => {
            const text = stripInline(l.replace(/^([-*]|\d+[.)])\s+/, ''));
            return { text, seg: seg(text) };
          }),
        });
        continue;
      }
      const text = stripInline(lines.join(' '));
      blocks.push({ kind: 'paragraph', text, seg: seg(text) });
    }
    return { blocks, segments };
  }

  function stripInline(text: string): string {
    return text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  const rendered = $derived(
    article === null ? { blocks: [], segments: [] } : toBlocks(article.markdown),
  );

  // ---- saved content + annotations ----
  let contentItem = $state<ContentItemRow | null>(null);
  let store = $state.raw<AnnotationsStore | null>(null);

  $effect(() => {
    const url = target;
    if (url === '') return;
    void getDb()
      .then((db) => findContentByUrl(db, url))
      .then((item) => {
        contentItem = item;
        untrack(() => {
          store?.destroy();
          store = item === null ? null : createAnnotationsStore(item.id);
        });
      })
      .catch(() => {});
  });

  onDestroy(() => store?.destroy());

  const annotations = $derived(store?.items ?? []);

  // Highlight runs per segment: [{text, ann}] — pure Svelte render, no DOM hacks.
  interface Run {
    text: string;
    ann: ParsedAnnotation | null;
  }
  const runsBySeg = $derived.by(() => {
    const map = new Map<number, Run[]>();
    if (annotations.length === 0) return map;
    const bySeg = new Map<number, ParsedAnnotation[]>();
    for (const a of annotations) {
      const seg = a.anchor.segment_index ?? -1;
      if (seg < 0 || seg >= rendered.segments.length) continue;
      const list = bySeg.get(seg) ?? [];
      list.push(a);
      bySeg.set(seg, list);
    }
    for (const [seg, anns] of bySeg) {
      const text = rendered.segments[seg] ?? '';
      const ranges = anns
        .map((a) => ({ a, r: resolveAnchor(text, a.anchor) }))
        .filter(
          (x): x is { a: ParsedAnnotation; r: { start: number; end: number; exact: boolean } } =>
            x.r !== null,
        )
        .toSorted((x, y) => x.r.start - y.r.start);
      const runs: Run[] = [];
      let pos = 0;
      for (const { a, r } of ranges) {
        const start = Math.max(pos, r.start);
        if (start >= r.end) continue; // overlapped by a previous highlight
        if (start > pos) runs.push({ text: text.slice(pos, start), ann: null });
        runs.push({ text: text.slice(start, r.end), ann: a });
        pos = r.end;
      }
      if (pos < text.length) runs.push({ text: text.slice(pos), ann: null });
      if (runs.length > 0) map.set(seg, runs);
    }
    return map;
  });

  /** highlights whose anchor no longer resolves — kept visible in the panel */
  const orphanIds = $derived(
    new Set(
      annotations
        .filter((a) => {
          const seg = a.anchor.segment_index ?? -1;
          const text = rendered.segments[seg];
          return text === undefined || resolveAnchor(text, a.anchor) === null;
        })
        .map((a) => a.id),
    ),
  );

  // ---- flows ----
  let articleEl = $state<HTMLElement | null>(null);
  let saveModalOpen = $state(false);
  let saveTopic = $state('');
  let topicOptions = $state<SelectOption[]>([]);
  let pendingAction = $state<{ sel: SelectionInfo; kind: 'highlight' | 'note' | 'card' } | null>(
    null,
  );
  let noteModal = $state<SelectionInfo | null>(null);
  let noteText = $state('');
  let cardModal = $state<SelectionInfo | null>(null);
  let panelOpen = $state(false);

  async function ensureSaved(
    sel: SelectionInfo,
    kind: 'highlight' | 'note' | 'card',
  ): Promise<boolean> {
    if (contentItem !== null) return true;
    pendingAction = { sel, kind };
    topicOptions = await flatTopicOptions();
    if (topicOptions.length === 0) {
      showToast('crie uma trilha com tópicos antes de anotar', 'info');
      pendingAction = null;
      return false;
    }
    saveTopic = '';
    saveModalOpen = true;
    return false;
  }

  async function confirmSave(): Promise<void> {
    if (saveTopic === '' || article === null) return;
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    const item = await attachContent(db, deviceId, {
      topic_id: saveTopic,
      source: 'web',
      url: article.url || target,
      title: article.title,
      kind: 'article',
    });
    contentItem = item;
    store?.destroy();
    store = createAnnotationsStore(item.id);
    saveModalOpen = false;
    showToast('artigo salvo no tópico', 'success');
    const pending = pendingAction;
    pendingAction = null;
    if (pending !== null) dispatch(pending.sel, pending.kind);
  }

  function dispatch(sel: SelectionInfo, kind: 'highlight' | 'note' | 'card'): void {
    if (kind === 'highlight') void doHighlight(sel);
    else if (kind === 'note') openNote(sel);
    else cardModal = sel;
  }

  async function doHighlight(sel: SelectionInfo): Promise<void> {
    if (!(await ensureSaved(sel, 'highlight')) || store === null) return;
    const text = rendered.segments[sel.segIndex] ?? '';
    const anchor = makeAnchor(text, sel.start, sel.end, sel.segIndex);
    if (anchor === null) return;
    await store.add(anchor);
  }

  function openNote(sel: SelectionInfo): void {
    void (async () => {
      if (!(await ensureSaved(sel, 'note'))) return;
      noteText = '';
      noteModal = sel;
    })();
  }

  async function confirmNote(): Promise<void> {
    if (noteModal === null || store === null) return;
    const sel = noteModal;
    const text = rendered.segments[sel.segIndex] ?? '';
    const anchor = makeAnchor(text, sel.start, sel.end, sel.segIndex);
    if (anchor !== null) {
      await store.add(anchor, noteText.trim() === '' ? null : noteText.trim());
    }
    noteModal = null;
  }

  function openCard(sel: SelectionInfo): void {
    void (async () => {
      if (!(await ensureSaved(sel, 'card'))) return;
      cardModal = sel;
    })();
  }

  function scrollToAnnotation(id: string): void {
    const mark = articleEl?.querySelector(`mark[data-annotation-id="${id}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mark.classList.add('flash');
    setTimeout(() => mark.classList.remove('flash'), 1200);
  }

  $effect(() => {
    const url = target;
    article = null;
    error = null;
    if (url === '') {
      error = 'artigo não encontrado.';
      return;
    }
    loading = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authedFetch(`/proxy/firecrawl/scrape?url=${encodeURIComponent(url)}`);
        if (cancelled) return;
        if (res.status === 429) {
          error = 'limite mensal de leitura atingido — renova no próximo mês.';
        } else if (res.status === 503) {
          error = 'leitura de artigos não configurada.';
        } else if (!res.ok) {
          error = 'não foi possível carregar o artigo — abra o original.';
        } else {
          article = (await res.json()) as Article;
        }
      } catch {
        if (!cancelled) error = 'não foi possível carregar o artigo — abra o original.';
      } finally {
        if (!cancelled) loading = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<svelte:head>
  <title>StudyOS — leitura</title>
</svelte:head>

{#snippet segText(seg: number, fallback: string)}
  {#if runsBySeg.has(seg)}
    {#each runsBySeg.get(seg) ?? [] as run, k (k)}
      {#if run.ann !== null}
        <mark data-annotation-id={run.ann.id} class="hl" title={run.ann.note_md ?? undefined}
          >{run.text}</mark
        >
      {:else}{run.text}{/if}
    {/each}
  {:else}{fallback}{/if}
{/snippet}

<section data-testid="article-reader" class="mx-auto w-full max-w-[65ch] px-4 py-8">
  <div class="flex items-baseline justify-between gap-3">
    <a
      href="/library"
      class="type-meta text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      ← biblioteca
    </a>
    <span class="flex items-center gap-4">
      {#if annotations.length > 0 || contentItem !== null}
        <button
          type="button"
          onclick={() => (panelOpen = !panelOpen)}
          class="type-meta cursor-pointer text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          aria-expanded={panelOpen}
        >
          destaques{annotations.length > 0 ? ` · ${annotations.length}` : ''}
        </button>
      {/if}
      {#if target !== ''}
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          class="type-meta text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          abrir original →
        </a>
      {/if}
    </span>
  </div>

  {#if panelOpen}
    <div
      data-testid="annotations-panel"
      class="mt-4 rounded-panel border border-hairline bg-surface px-4 py-3"
    >
      {#if annotations.length === 0}
        <p class="type-meta text-text-soft">selecione um trecho do texto para destacar.</p>
      {:else}
        <ul class="flex flex-col">
          {#each annotations as ann (ann.id)}
            <li class="group flex items-start gap-2 border-t border-hairline py-2 first:border-t-0">
              <button
                type="button"
                onclick={() => scrollToAnnotation(ann.id)}
                class="min-w-0 flex-1 cursor-pointer text-left"
              >
                <span class="block truncate text-[13px] text-text-body">
                  “{ann.anchor.quote}”
                  {#if orphanIds.has(ann.id)}
                    <span class="type-label text-text-low">· trecho não localizado</span>
                  {/if}
                </span>
                {#if ann.note_md !== null}
                  <span class="block truncate text-[11.5px] text-text-low">{ann.note_md}</span>
                {/if}
              </button>
              <button
                type="button"
                aria-label="criar card deste destaque"
                title="criar card"
                onclick={() =>
                  (cardModal = {
                    segIndex: ann.anchor.segment_index ?? 0,
                    start: ann.anchor.start,
                    end: ann.anchor.end,
                    quote: ann.anchor.quote,
                  })}
                class="icon-btn opacity-0 group-hover:opacity-100"
              >
                <NavIcon name="plus" size={12} />
              </button>
              <button
                type="button"
                aria-label="excluir destaque"
                title="excluir"
                onclick={() => void store?.remove(ann.id)}
                class="icon-btn opacity-0 group-hover:opacity-100"
              >
                <NavIcon name="trash" size={12} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if loading}
    <p class="type-item mt-8 text-text-soft" aria-live="polite">carregando artigo…</p>
  {:else if error !== null}
    <p class="type-item mt-8 text-text-soft">{error}</p>
  {:else if article !== null}
    <h1 data-testid="article-title" class="type-h1 mt-8 text-text-hi">{article.title}</h1>
    <article
      data-testid="article-body"
      bind:this={articleEl}
      class="mt-6 font-body text-[17px] leading-7 text-text-reading"
    >
      {#each rendered.blocks as block, i (i)}
        {#if block.kind === 'heading'}
          {#if block.level === 1}
            <h2
              data-seg={block.seg}
              class="mt-8 font-display text-[22px] font-semibold text-text-hi"
            >
              {@render segText(block.seg, block.text)}
            </h2>
          {:else if block.level === 2}
            <h3
              data-seg={block.seg}
              class="mt-6 font-display text-[19px] font-semibold text-text-hi"
            >
              {@render segText(block.seg, block.text)}
            </h3>
          {:else}
            <h4
              data-seg={block.seg}
              class="mt-5 font-display text-[16px] font-semibold text-text-hi"
            >
              {@render segText(block.seg, block.text)}
            </h4>
          {/if}
        {:else if block.kind === 'list'}
          <ul class="mt-4 list-disc pl-5">
            {#each block.items as item (item.seg)}
              <li data-seg={item.seg} class="mt-1">{@render segText(item.seg, item.text)}</li>
            {/each}
          </ul>
        {:else}
          <p data-seg={block.seg} class="mt-4">{@render segText(block.seg, block.text)}</p>
        {/if}
      {/each}
    </article>
  {/if}
</section>

<SelectionActions
  container={articleEl}
  onHighlight={(sel) => void doHighlight(sel)}
  onNote={openNote}
  onCard={openCard}
/>

{#if saveModalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) saveModalOpen = false;
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-to-annotate-title"
      class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
    >
      <h2 id="save-to-annotate-title" class="flex items-center gap-1.5 type-label text-text-low">
        <NavIcon name="book" size={12} />
        salvar para anotar
      </h2>
      <p class="type-item mt-3 text-text-body">
        destaques vivem junto do conteúdo salvo — escolha o tópico deste artigo.
      </p>
      <div class="mt-3">
        <SelectSearch
          options={topicOptions}
          bind:value={saveTopic}
          testid="save-annotate-topic"
          ariaLabel="tópico do artigo"
          placeholder="escolha um tópico"
        />
      </div>
      <button
        data-testid="save-annotate-confirm"
        type="button"
        disabled={saveTopic === ''}
        onclick={() => void confirmSave()}
        class="mt-4 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        salvar e continuar
      </button>
    </div>
  </div>
{/if}

{#if noteModal !== null}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) noteModal = null;
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-title"
      class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
    >
      <h2 id="note-title" class="type-label text-text-low">nota do destaque</h2>
      <p class="type-meta mt-2 truncate text-text-low">“{noteModal.quote}”</p>
      <textarea
        data-testid="annotation-note-input"
        bind:value={noteText}
        rows="3"
        placeholder="o que este trecho te lembra?"
        class="type-item mt-3 w-full resize-y rounded-base border border-border bg-surface px-3 py-2 text-text-body placeholder:text-text-low"
      ></textarea>
      <button
        data-testid="annotation-note-save"
        type="button"
        onclick={() => void confirmNote()}
        class="mt-3 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        salvar nota
      </button>
    </div>
  </div>
{/if}

{#if cardModal !== null && contentItem !== null}
  <CardFromSelection
    quote={cardModal.quote}
    source={{ content_item_id: contentItem.id, url: contentItem.url ?? target, kind: 'reading' }}
    topicId={contentItem.topic_id}
    onClose={() => (cardModal = null)}
  />
{/if}

<style>
  :global(mark.hl) {
    background: var(--accent-tint-12);
    color: inherit;
    border-radius: 2px;
    box-shadow: 0 1px 0 var(--accent-dim);
    cursor: default;
    transition: background-color var(--dur-base) var(--ease);
  }
  :global(mark.hl.flash) {
    outline: 1px solid var(--accent);
  }
</style>
