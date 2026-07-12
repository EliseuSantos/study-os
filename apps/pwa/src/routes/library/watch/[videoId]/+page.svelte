<script lang="ts">
  import { page } from '$app/state';
  import { onDestroy, untrack } from 'svelte';
  import { parseTimedText, type TranscriptCue } from '@studyos/connectors';
  import { makeAnchor, resolveAnchor } from '@studyos/core';
  import { findContentByExternalId } from '@studyos/db';
  import type { ContentItemRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { authedFetch } from '$lib/stores/library.svelte';
  import {
    createAnnotationsStore,
    type AnnotationsStore,
    type ParsedAnnotation,
  } from '$lib/stores/annotations.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import CardFromSelection from '$lib/components/CardFromSelection.svelte';
  import SelectionActions, {
    type SelectionInfo,
  } from '$lib/components/SelectionActions.svelte';

  const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
  const VIDEO_ID_RE = /^[A-Za-z0-9_-]{5,20}$/;

  const videoId = $derived(page.params.videoId ?? '');
  const validId = $derived(VIDEO_ID_RE.test(videoId));

  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let cues = $state<TranscriptCue[]>([]);
  let transcriptState = $state<'loading' | 'ready' | 'missing'>('loading');
  let follow = $state(false);
  let currentTime = $state(0);
  let cueEls: (HTMLElement | null)[] = [];

  $effect(() => {
    const id = videoId;
    if (!VIDEO_ID_RE.test(id)) return;
    let cancelled = false;
    transcriptState = 'loading';
    cues = [];
    void (async () => {
      try {
        const res = await authedFetch(`/proxy/youtube/transcript?id=${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (!res.ok) {
          transcriptState = 'missing';
          return;
        }
        const parsed = parseTimedText(await res.text());
        if (cancelled) return;
        if (parsed.length === 0) {
          transcriptState = 'missing';
          return;
        }
        cues = parsed;
        transcriptState = 'ready';
      } catch {
        if (!cancelled) transcriptState = 'missing';
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  // Defensive: the embed may not be ready or may be cross-origin-restricted.
  function post(message: Record<string, unknown>): void {
    try {
      iframeEl?.contentWindow?.postMessage(JSON.stringify(message), EMBED_ORIGIN);
    } catch {
      // iframe not ready — ignore.
    }
  }

  function seek(start: number): void {
    post({ event: 'command', func: 'seekTo', args: [start, true] });
  }

  // Follow mode: ask the player to stream infoDelivery messages and track
  // currentTime; re-posting 'listening' keeps updates flowing after reloads.
  $effect(() => {
    if (!follow) return;
    const listen = () => post({ event: 'listening', id: 'studyos', channel: 'widget' });
    listen();
    const interval = setInterval(listen, 1000);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== EMBED_ORIGIN) return;
      try {
        const data: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (typeof data !== 'object' || data === null) return;
        const info = (data as { info?: unknown }).info;
        if (typeof info !== 'object' || info === null) return;
        const t = (info as { currentTime?: unknown }).currentTime;
        if (typeof t === 'number' && Number.isFinite(t)) currentTime = t;
      } catch {
        // non-JSON message — ignore.
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('message', onMessage);
    };
  });

  const activeIndex = $derived.by(() => {
    if (!follow) return -1;
    let index = -1;
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (cue === undefined || cue.start > currentTime) break;
      index = i;
    }
    return index;
  });

  $effect(() => {
    if (activeIndex < 0) return;
    cueEls[activeIndex]?.scrollIntoView({ block: 'nearest' });
  });

  function fmt(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---- annotations over transcript cues (only when the video is saved) ----
  let contentItem = $state<ContentItemRow | null>(null);
  let store = $state.raw<AnnotationsStore | null>(null);
  let transcriptEl = $state<HTMLElement | null>(null);
  let cardModal = $state<SelectionInfo | null>(null);

  $effect(() => {
    const id = videoId;
    if (!VIDEO_ID_RE.test(id)) return;
    void getDb()
      .then((db) => findContentByExternalId(db, 'youtube', id))
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

  interface Run {
    text: string;
    ann: ParsedAnnotation | null;
  }
  const runsBySeg = $derived.by(() => {
    const map = new Map<number, Run[]>();
    for (const a of annotations) {
      const seg = a.anchor.segment_index ?? -1;
      const text = cues[seg]?.text;
      if (text === undefined) continue;
      const r = resolveAnchor(text, a.anchor);
      if (r === null) continue;
      // v1: one highlight per cue; a second one on the same cue is ignored
      if (!map.has(seg)) {
        map.set(seg, [
          { text: text.slice(0, r.start), ann: null },
          { text: text.slice(r.start, r.end), ann: a },
          { text: text.slice(r.end), ann: null },
        ]);
      }
    }
    return map;
  });

  function requireSaved(): boolean {
    if (contentItem !== null) return true;
    showToast('salve este vídeo num tópico (biblioteca → salvar) para anotar', 'info');
    return false;
  }

  async function doHighlight(sel: SelectionInfo): Promise<void> {
    if (!requireSaved() || store === null) return;
    const text = cues[sel.segIndex]?.text ?? '';
    const anchor = makeAnchor(text, sel.start, sel.end, sel.segIndex);
    if (anchor === null) return;
    await store.add(anchor);
  }

  function openCard(sel: SelectionInfo): void {
    if (!requireSaved()) return;
    cardModal = sel;
  }
</script>

<svelte:head>
  <title>StudyOS — vídeo</title>
</svelte:head>

<section class="mx-auto w-full max-w-[900px] px-4 py-6 lg:px-8 lg:py-7">
  <a
    href="/library"
    class="type-meta text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
  >
    ← biblioteca
  </a>

  {#if !validId}
    <p class="type-item mt-8 text-text-soft">vídeo não encontrado.</p>
  {:else}
    <iframe
      data-testid="video-player"
      bind:this={iframeEl}
      src={`${EMBED_ORIGIN}/embed/${videoId}?enablejsapi=1`}
      title="player de vídeo do youtube"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      class="mt-6 aspect-video w-full rounded-base border border-hairline bg-bg-deep"
    ></iframe>

    <div class="mt-6 flex items-center justify-between gap-3">
      <h2 class="type-label text-text-low">transcrição</h2>
      <button
        data-testid="transcript-follow"
        type="button"
        aria-pressed={follow}
        onclick={() => (follow = !follow)}
        class="type-meta h-(--h-button-md) cursor-pointer rounded-chip border px-3 transition-colors duration-(--dur-base) ease-brand {follow
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-border text-text-mid hover:text-text-hi'}"
      >
        seguir vídeo
      </button>
    </div>

    <div data-testid="transcript-panel" bind:this={transcriptEl} class="mt-3 max-h-96 overflow-y-auto">
      {#if transcriptState === 'loading'}
        <p class="type-item text-text-soft" aria-live="polite">carregando transcrição…</p>
      {:else if transcriptState === 'missing'}
        <p class="type-item text-text-soft">sem transcrição disponível.</p>
      {:else}
        <ul role="list">
          {#each cues as cue, i (i)}
            <li
              bind:this={cueEls[i]}
              class="flex gap-3 rounded-micro px-2 py-1.5 {i === activeIndex ? 'cue-active' : ''}"
            >
              <button
                data-testid="transcript-cue"
                type="button"
                onclick={() => seek(cue.start)}
                title="ir para {fmt(cue.start)}"
                class="type-meta shrink-0 cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-accent"
              >
                [{fmt(cue.start)}]
              </button>
              <span data-seg={i} class="type-item font-body text-text-body select-text">
                {#if runsBySeg.has(i)}
                  {#each runsBySeg.get(i) ?? [] as run, k (k)}
                    {#if run.ann !== null}
                      <mark data-annotation-id={run.ann.id} class="hl">{run.text}</mark>
                    {:else}{run.text}{/if}
                  {/each}
                {:else}{cue.text}{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<SelectionActions
  container={transcriptEl}
  onHighlight={(sel) => void doHighlight(sel)}
  onNote={(sel) => void doHighlight(sel)}
  onCard={openCard}
/>

{#if cardModal !== null && contentItem !== null}
  <CardFromSelection
    quote={cardModal.quote}
    source={{
      content_item_id: contentItem.id,
      url: contentItem.url ?? `https://www.youtube.com/watch?v=${videoId}`,
      ts: cues[cardModal.segIndex]?.start ?? 0,
      kind: 'video',
    }}
    topicId={contentItem.topic_id}
    onClose={() => (cardModal = null)}
  />
{/if}

<style>
  .cue-active {
    background: var(--accent-tint-10);
  }
  :global(mark.hl) {
    background: var(--accent-tint-12);
    color: inherit;
    border-radius: 2px;
    box-shadow: 0 1px 0 var(--accent-dim);
  }
</style>
