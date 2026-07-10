<script lang="ts">
  import { page } from '$app/state';
  import { parseTimedText, type TranscriptCue } from '@studyos/connectors';
  import { authedFetch } from '$lib/stores/library.svelte';

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
</script>

<svelte:head>
  <title>StudyOS — vídeo</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
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

    <div data-testid="transcript-panel" class="mt-3 max-h-96 overflow-y-auto">
      {#if transcriptState === 'loading'}
        <p class="type-item text-text-soft" aria-live="polite">carregando transcrição…</p>
      {:else if transcriptState === 'missing'}
        <p class="type-item text-text-soft">sem transcrição disponível.</p>
      {:else}
        <ul role="list">
          {#each cues as cue, i (i)}
            <li>
              <button
                data-testid="transcript-cue"
                bind:this={cueEls[i]}
                type="button"
                onclick={() => seek(cue.start)}
                class="flex w-full cursor-pointer gap-3 rounded-micro px-2 py-1.5 text-left transition-colors duration-(--dur-base) ease-brand hover:bg-surface {i ===
                activeIndex
                  ? 'cue-active'
                  : ''}"
              >
                <span class="type-meta shrink-0 text-text-low">[{fmt(cue.start)}]</span>
                <span class="type-item font-body text-text-body">{cue.text}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .cue-active {
    background: var(--accent-tint-10);
  }
</style>
