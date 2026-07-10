<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { page } from '$app/state';
  import { getOrCreateDeviceId, updateTrack } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { createTrackDetailStore, type TrackDetailStore } from '$lib/stores/tracksDetail.svelte';
  import { buildTopicTree, type TreeActions } from './tree';
  import TopicNode from './TopicNode.svelte';
  import TopicForm from './TopicForm.svelte';
  import OutlineImport from './OutlineImport.svelte';
  import CardsPanel from './CardsPanel.svelte';
  import CycleEditor from './CycleEditor.svelte';
  import TopicContent from './TopicContent.svelte';
  import LessonsPanel from './LessonsPanel.svelte';
  import TrackActions from './TrackActions.svelte';
  import MindMap from './MindMap.svelte';

  const trackId = $derived(page.params.id ?? '');

  let store = $state.raw<TrackDetailStore | null>(null);
  const collapsed = new SvelteSet<string>();
  // 'root' = the root-level inline create form; a topic id = that node's child form.
  // A single value guarantees only one topic-form exists in the DOM at a time.
  let openFormId = $state<string>('root');
  let view = $state<'tree' | 'map'>('tree');

  $effect(() => {
    const next = createTrackDetailStore(trackId);
    untrack(() => {
      store = next;
      collapsed.clear();
      openFormId = 'root';
    });
    return () => next.destroy();
  });

  const track = $derived(store?.track ?? null);
  const trackLoaded = $derived(store?.trackLoaded ?? false);
  const topics = $derived(store?.topics ?? []);
  const cards = $derived(store?.cards ?? []);
  const selectedId = $derived(store?.selectedTopicId ?? null);
  const tree = $derived(buildTopicTree(topics));
  const selectedTopic = $derived(topics.find((t) => t.id === selectedId) ?? null);

  const actions: TreeActions = {
    select: (id) => store?.selectTopic(id),
    cycleStatus: (topic) => void store?.cycleStatus(topic),
    toggleCollapsed: (id) => {
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
    },
    openChildForm: (id) => (openFormId = id),
    closeForm: () => (openFormId = 'root'),
    submitChild: async (parentId, title) => {
      await store?.addTopic(parentId, title);
      openFormId = 'root';
    },
  };

  function setMode(mode: 'schedule' | 'cycle') {
    if (track === null || track.mode === mode) return;
    void (async () => {
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      // The db worker broadcasts tables-changed ['tracks'], refreshing trackLive.
      await updateTrack(db, deviceId, trackId, { mode });
    })();
  }
</script>

<svelte:head>
  <title>StudyOS — {track?.title ?? 'trilha'}</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <a
    href="/tracks"
    class="type-meta text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
  >
    ← trilhas
  </a>

  {#if !trackLoaded}
    <p class="type-item mt-6 text-text-soft">carregando…</p>
  {:else if track === null}
    <h1 class="type-h1 mt-6 text-text-hi">trilha não encontrada</h1>
    <p class="type-item mt-4 text-text-soft">
      talvez ela tenha sido removida ou o endereço esteja errado.
      <a href="/tracks" class="text-text-mid underline underline-offset-2 hover:text-text-hi">
        voltar às trilhas
      </a>
    </p>
  {:else}
    <p class="type-label mt-6 text-text-low">trilha</p>
    <h1 class="type-h1 mt-2 text-text-hi">{track.title}</h1>

    <div
      data-testid="track-mode-toggle"
      role="group"
      aria-label="modo da trilha"
      class="mt-4 inline-flex overflow-hidden rounded-base border border-border"
    >
      <button
        type="button"
        aria-pressed={track.mode !== 'cycle'}
        onclick={() => setMode('schedule')}
        class="type-meta cursor-pointer px-3 py-1.5 transition-colors duration-(--dur-base) ease-brand {track.mode !==
        'cycle'
          ? 'bg-surface-2 text-text-hi'
          : 'text-text-mid hover:text-text-hi'}"
      >
        cronograma
      </button>
      <button
        type="button"
        aria-pressed={track.mode === 'cycle'}
        onclick={() => setMode('cycle')}
        class="type-meta cursor-pointer border-l border-hairline px-3 py-1.5 transition-colors duration-(--dur-base) ease-brand {track.mode ===
        'cycle'
          ? 'bg-surface-2 text-text-hi'
          : 'text-text-mid hover:text-text-hi'}"
      >
        ciclo
      </button>
    </div>

    <div class="mt-10 flex items-center justify-between gap-3">
      <h2 class="type-label text-text-low">
        tópicos{topics.length > 0 ? ` · ${topics.length}` : ''}
      </h2>
      <div
        data-testid="view-toggle"
        role="group"
        aria-label="visualização dos tópicos"
        class="inline-flex overflow-hidden rounded-base border border-border"
      >
        <button
          type="button"
          aria-pressed={view === 'tree'}
          onclick={() => (view = 'tree')}
          class="type-meta cursor-pointer px-3 py-1.5 transition-colors duration-(--dur-base) ease-brand {view ===
          'tree'
            ? 'bg-surface-2 text-text-hi'
            : 'text-text-mid hover:text-text-hi'}"
        >
          árvore
        </button>
        <button
          type="button"
          aria-pressed={view === 'map'}
          onclick={() => (view = 'map')}
          class="type-meta cursor-pointer border-l border-hairline px-3 py-1.5 transition-colors duration-(--dur-base) ease-brand {view ===
          'map'
            ? 'bg-surface-2 text-text-hi'
            : 'text-text-mid hover:text-text-hi'}"
        >
          mapa
        </button>
      </div>
    </div>

    <div class="mt-3">
      <OutlineImport
        onconfirm={async (nodes) => {
          await store?.importOutline(nodes);
        }}
      />
    </div>

    {#if openFormId === 'root'}
      <div class="mt-4">
        <TopicForm label="novo tópico" oncreate={(title) => actions.submitChild(null, title)} />
      </div>
    {/if}

    {#if view === 'tree'}
      <ul data-testid="topic-tree" role="list" class="mt-4">
        {#each tree as node (node.topic.id)}
          <TopicNode {node} {selectedId} {collapsed} {openFormId} {actions} />
        {/each}
      </ul>
    {:else}
      <MindMap {topics} {selectedId} onSelect={(id) => actions.select(id)} />
    {/if}

    {#if topics.length === 0}
      <p class="type-item mt-2 text-text-soft">
        nenhum tópico ainda — importe um edital ou crie o primeiro.
      </p>
    {/if}

    {#if track.mode === 'cycle'}
      <CycleEditor trackId={track.id} {topics} />
    {/if}

    <section class="mt-12">
      {#if selectedTopic}
        <h2 class="mb-6 type-label text-text-low">tópico · {selectedTopic.title}</h2>
        <CardsPanel
          topic={selectedTopic}
          {cards}
          onadd={(front, back) => store?.addCard(front, back) ?? Promise.resolve()}
        />
        <TopicContent topicId={selectedTopic.id} />
      {:else}
        <h2 class="type-label text-text-low">cards</h2>
        <p class="type-item mt-3 text-text-soft">selecione um tópico para ver e criar cards.</p>
      {/if}
    </section>
    <LessonsPanel trackId={track.id} />
    <TrackActions trackId={track.id} />
  {/if}
</section>
