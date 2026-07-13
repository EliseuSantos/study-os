<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { page } from '$app/state';
  import { examGoalForTrack, getOrCreateDeviceId, listQuizCardsByTrack, updateTrack } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { createTrackDetailStore, type TrackDetailStore } from '$lib/stores/tracksDetail.svelte';
  import { buildTopicTree, type TreeActions } from './tree';
  import TopicNode from './TopicNode.svelte';
  import OutlineImport from './OutlineImport.svelte';
  import TopicForm from './TopicForm.svelte';
  import TopicQuiz from './TopicQuiz.svelte';
  import WhyNote from '$lib/components/WhyNote.svelte';
  import { isoWeek } from '@studyos/core';
  import { showToast } from '$lib/stores/toast.svelte';
  import CardsPanel from './CardsPanel.svelte';
  import ErrorsPanel from './ErrorsPanel.svelte';
  import CycleEditor from './CycleEditor.svelte';
  import TopicContent from './TopicContent.svelte';
  import LessonsPanel from './LessonsPanel.svelte';
  import ClassesPanel from './ClassesPanel.svelte';
  import TrackActions from './TrackActions.svelte';
  import MindMap from './MindMap.svelte';
  import TrackGantt from './TrackGantt.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  const trackId = $derived(page.params.id ?? '');

  let store = $state.raw<TrackDetailStore | null>(null);
  const collapsed = new SvelteSet<string>();
  // '' = no form; 'root' = the root-level create form; a topic id = that node's
  // child form. A single value guarantees only one topic-form in the DOM at a time.
  let openFormId = $state<string>('');
  let view = $state<'tree' | 'map' | 'gantt' | 'ciclo'>('tree');
  let stageTab = $state<'cards' | 'conteudo' | 'aulas' | 'erros'>('cards');
  // exam mode: dated goal linked to this track
  let examDate = $state<number | null>(null);
  $effect(() => {
    const id = trackId;
    void getDb()
      .then((db) => examGoalForTrack(db, id, Date.now()))
      .then((goal) => (examDate = goal?.target_date ?? null))
      .catch(() => {});
  });
  // track-wide practice over every quiz card
  let trackQuizCards = $state<import('@studyos/shared').CardRow[]>([]);
  let trackQuizOpen = $state(false);
  $effect(() => {
    const id = trackId;
    void cards.length;
    void getDb()
      .then((db) => listQuizCardsByTrack(db, id))
      .then((list) => (trackQuizCards = list))
      .catch(() => {});
  });

  const examDays = $derived(
    examDate === null ? null : Math.max(0, Math.ceil((examDate - Date.now()) / 86_400_000)),
  );

  $effect(() => {
    const next = createTrackDetailStore(trackId);
    untrack(() => {
      store = next;
      collapsed.clear();
      openFormId = '';
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
  const doneCount = $derived(topics.filter((t) => t.status === 'done').length);
  const pct = $derived(topics.length === 0 ? 0 : Math.round((doneCount / topics.length) * 100));

  // guided review: current-week focus set lives on the track row
  const focusSet = $derived.by(() => {
    const t = track;
    if (t === null || t.focus_week !== isoWeek(Date.now()) || t.focus_topic_ids === null) {
      return new Set<string>();
    }
    try {
      return new Set(JSON.parse(t.focus_topic_ids) as string[]);
    } catch {
      return new Set<string>();
    }
  });

  async function toggleFocus(topicId: string): Promise<void> {
    const t = track;
    if (t === null) return;
    const week = isoWeek(Date.now());
    const current = t.focus_week === week ? [...focusSet] : [];
    const next = current.includes(topicId)
      ? current.filter((id) => id !== topicId)
      : [...current, topicId];
    if (next.length > 5) {
      showToast('foco da semana vai até 5 tópicos — menos é mais', 'info');
      return;
    }
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await updateTrack(db, deviceId, t.id, {
      focus_week: next.length === 0 ? null : week,
      focus_topic_ids: next.length === 0 ? null : JSON.stringify(next),
    });
  }

  const actions: TreeActions = {
    select: (id) => store?.selectTopic(id),
    cycleStatus: (topic) => void store?.cycleStatus(topic),
    toggleFocus: (topic) => void toggleFocus(topic.id),
    isFocused: (id) => focusSet.has(id),
    toggleCollapsed: (id) => {
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
    },
    openChildForm: (id) => (openFormId = id),
    closeForm: () => (openFormId = ''),
    submitChild: async (parentId, title) => {
      await store?.addTopic(parentId, title);
      openFormId = '';
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

<div class="mx-auto w-full max-w-[1120px] px-4 py-6 lg:px-8 lg:py-7">
  <a
    href="/tracks"
    class="type-meta text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
  >
    ← trilhas
  </a>

  {#if !trackLoaded}
    <p class="type-item mt-6 text-text-soft">carregando…</p>
  {:else if track === null}
    <h1 class="mt-6 text-[25px] font-semibold tracking-tight text-text-hi">trilha não encontrada</h1>
    <p class="type-item mt-4 text-text-soft">
      talvez ela tenha sido removida ou o endereço esteja errado.
      <a href="/tracks" class="text-text-mid underline underline-offset-2 hover:text-text-hi">
        voltar às trilhas
      </a>
    </p>
  {:else}
    <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-4">
        <span class="track-ring shrink-0" style="--p:{pct}" role="img" aria-label={`${pct}% da trilha dominada`}>
          <span class="tabular-nums">{pct}%</span>
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-[25px] font-semibold tracking-tight text-text-hi">{track.title}</h1>
          <p class="type-meta mt-0.5 text-text-low tabular-nums">
            {#if examDays !== null}
              <span data-testid="exam-countdown" class="text-accent">
                prova em {examDays} {examDays === 1 ? 'dia' : 'dias'}
              </span>
              ·
            {/if}
            {doneCount} / {topics.length} tópicos dominados
          </p>
        </div>
      </div>

    </div>

    <div class="mt-5 grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <!-- course sidebar: progress + module tree (skillwave-style) -->
      <div class="rounded-panel border border-hairline bg-surface">
        <div class="px-4 pt-4 lg:px-5">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="flex items-center gap-1.5 type-label text-text-low">
              <NavIcon name="list" size={12} />
              conteúdo da trilha
            </h2>
            <span class="text-[12px] font-semibold text-text-mid tabular-nums">{pct}%</span>
          </div>
          <div class="mt-2.5 mb-4 h-1.5 rounded-[3px] bg-hairline" aria-hidden="true">
            <span class="grow-x block h-1.5 rounded-[3px] bg-accent" style="width:{pct}%"></span>
          </div>
        </div>

        <div class="border-t border-hairline px-2.5 py-2.5">
          <ul data-testid="topic-tree" role="list">
            {#each tree as node (node.topic.id)}
              <TopicNode {node} {selectedId} {collapsed} {openFormId} {actions} />
            {/each}
          </ul>

          {#if topics.length === 0 && openFormId !== 'root'}
            <p class="type-item px-2 py-3 text-text-soft">
              nenhum tópico ainda — comece pelo primeiro.
            </p>
          {/if}

          {#if openFormId === 'root'}
            <div class="px-2 py-2.5">
              <TopicForm
                label="novo tópico"
                focusOnOpen
                oncreate={(title) => actions.submitChild(null, title)}
                oncancel={() => actions.closeForm()}
              />
            </div>
          {:else}
            <button
              data-testid="topic-open-form"
              type="button"
              onclick={() => (openFormId = 'root')}
              class="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-base px-2 py-2 text-[12.5px] font-semibold text-text-low transition-colors duration-(--dur-base) ease-brand hover:bg-surface-2 hover:text-text-hi"
            >
              <NavIcon name="plus" size={13} />
              novo tópico
            </button>
          {/if}
        </div>

        {#if trackQuizCards.length > 0}
          <div class="border-t border-hairline px-4 py-3.5 lg:px-5">
            <button
              data-testid="track-quiz-start"
              type="button"
              onclick={() => (trackQuizOpen = true)}
              class="type-meta w-full cursor-pointer rounded-base border border-border px-3 py-2 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
            >
              praticar a trilha · {trackQuizCards.length}
              {trackQuizCards.length === 1 ? 'questão' : 'questões'}
            </button>
          </div>
        {/if}

        <div class="border-t border-hairline px-4 py-3.5 lg:px-5">
          <OutlineImport
            onconfirm={async (nodes) => {
              await store?.importOutline(nodes);
            }}
          />
        </div>

        <div class="border-t border-hairline px-4 py-3.5 lg:px-5">
          <TrackActions trackId={track.id} />
        </div>

        <div class="border-t border-hairline px-4 py-3.5 lg:px-5">
          <ClassesPanel trackId={track.id} />
        </div>
      </div>

      <!-- main stage -->
      <div class="flex min-w-0 flex-col gap-4">
        <div class="rounded-panel border border-hairline bg-surface">
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 lg:px-5">
            <h2 class="flex min-w-0 items-center gap-1.5 type-label text-text-low">
              <NavIcon name="target" size={12} />
              <span class="truncate">
                {selectedTopic ? `tópico · ${selectedTopic.title}` : 'tópico'}
              </span>
            </h2>
            <div
              data-testid="view-toggle"
              role="group"
              aria-label="visualização da trilha"
              class="inline-flex overflow-hidden rounded-base border border-border"
            >
              <button
                type="button"
                aria-pressed={view === 'tree'}
                onclick={() => (view = 'tree')}
                class="type-meta cursor-pointer px-3 py-1 transition-colors duration-(--dur-base) ease-brand {view ===
                'tree'
                  ? 'bg-surface-2 text-text-hi'
                  : 'text-text-mid hover:text-text-hi'}"
              >
                conteúdo
              </button>
              <button
                type="button"
                aria-pressed={view === 'map'}
                onclick={() => (view = 'map')}
                class="type-meta cursor-pointer border-l border-hairline px-3 py-1 transition-colors duration-(--dur-base) ease-brand {view ===
                'map'
                  ? 'bg-surface-2 text-text-hi'
                  : 'text-text-mid hover:text-text-hi'}"
              >
                mapa
              </button>
              <button
                type="button"
                aria-pressed={view === 'gantt'}
                onclick={() => (view = 'gantt')}
                class="type-meta cursor-pointer border-l border-hairline px-3 py-1 transition-colors duration-(--dur-base) ease-brand {view ===
                'gantt'
                  ? 'bg-surface-2 text-text-hi'
                  : 'text-text-mid hover:text-text-hi'}"
              >
                gantt
              </button>
              <button
                type="button"
                aria-pressed={view === 'ciclo'}
                onclick={() => (view = 'ciclo')}
                class="type-meta cursor-pointer border-l border-hairline px-3 py-1 transition-colors duration-(--dur-base) ease-brand {view ===
                'ciclo'
                  ? 'bg-surface-2 text-text-hi'
                  : 'text-text-mid hover:text-text-hi'}"
              >
                ciclo
              </button>
            </div>
          </div>

          {#if view === 'map'}
            <div class="border-t border-hairline px-4 py-4 lg:px-5">
              <MindMap {topics} {selectedId} onSelect={(id) => actions.select(id)} />
            </div>
          {:else if view === 'gantt'}
            <div class="border-t border-hairline px-4 py-4 lg:px-5">
              <TrackGantt {trackId} />
            </div>
          {:else if view === 'ciclo'}
            <div class="border-t border-hairline px-4 py-4 lg:px-5">
              <WhyNote
                flag="cycle"
                text="alternar matérias no ciclo (interleaving) rende mais que maratonar uma só — os pesos definem a frequência."
              />
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="type-meta text-text-low">
                  {track.mode === 'cycle'
                    ? 'o planner segue os pesos deste ciclo'
                    : 'ative o ciclo para o planner usar estes pesos'}
                </p>
                <div
                  data-testid="track-mode-toggle"
                  role="group"
                  aria-label="modo da trilha"
                  class="inline-flex overflow-hidden rounded-base border border-border"
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
              </div>
              <div class="mt-4 border-t border-hairline pt-4 {track.mode === 'cycle' ? '' : 'opacity-60'}">
                <CycleEditor trackId={track.id} {topics} />
              </div>
            </div>
          {:else}
            <!-- course tabs (skillwave-style) -->
            <div
              data-testid="stage-tabs"
              role="tablist"
              aria-label="conteúdo do tópico"
              class="flex gap-1 border-t border-hairline px-4 lg:px-5"
            >
              {#each [{ id: 'cards', label: `cards · ${cards.length}` }, { id: 'conteudo', label: 'conteúdo' }, { id: 'aulas', label: 'aulas' }, { id: 'erros', label: 'erros' }] as tab (tab.id)}
                <button
                  type="button"
                  role="tab"
                  aria-selected={stageTab === tab.id}
                  onclick={() => (stageTab = tab.id as typeof stageTab)}
                  class="cursor-pointer border-b-2 px-3 py-2.5 text-[12.5px] font-semibold transition-colors duration-(--dur-base) ease-brand tabular-nums {stageTab ===
                  tab.id
                    ? 'border-accent text-text-hi'
                    : 'border-transparent text-text-mid hover:text-text-hi'}"
                >
                  {tab.label}
                </button>
              {/each}
            </div>

            <div class="border-t border-hairline px-4 py-4 lg:px-5">
              {#if stageTab === 'erros'}
                <ErrorsPanel trackId={track.id} />
              {:else if stageTab === 'aulas'}
                <LessonsPanel trackId={track.id} />
              {:else if selectedTopic === null}
                <p class="type-item text-text-soft">
                  selecione um tópico na lista ao lado para ver {stageTab === 'cards'
                    ? 'os cards'
                    : 'o conteúdo'}.
                </p>
              {:else if stageTab === 'cards'}
                <CardsPanel
                  trackId={track.id}
                  onaddQuiz={async (json) => {
                    await store?.addQuizCard(json);
                  }}
                  topic={selectedTopic}
                  {cards}
                  onadd={(front, back) => store?.addCard(front, back) ?? Promise.resolve()}
                />
              {:else}
                <TopicContent topicId={selectedTopic.id} />
              {/if}
            </div>
          {/if}
        </div>

      </div>
    </div>
  {/if}
</div>

{#if trackQuizOpen && track !== null}
  <TopicQuiz
    cards={trackQuizCards}
    trackId={track.id}
    topicId={null}
    onClose={() => (trackQuizOpen = false)}
  />
{/if}

<style>
  @media (prefers-reduced-motion: no-preference) {
    .grow-x {
      animation: grow-x 0.7s var(--ease-brand) both;
      transform-origin: left;
    }
  }
  @keyframes grow-x {
    from {
      transform: scaleX(0);
    }
  }

  .track-ring {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: conic-gradient(var(--accent) calc(var(--p) * 1%), var(--hairline) 0);
  }
  .track-ring > span {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--bg);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-hi);
  }
</style>
