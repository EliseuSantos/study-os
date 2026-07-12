<script lang="ts">
  import SelectSearch from '$lib/components/SelectSearch.svelte';
  import { onDestroy } from 'svelte';
  import { getOrCreateDeviceId, listCycleSlots, setCycleSlots } from '@studyos/db';
  import type { TopicRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';

  let { trackId, topics }: { trackId: string; topics: TopicRow[] } = $props();

  interface LocalSlot {
    topic_id: string;
    weight: number;
  }

  let slots = $state<LocalSlot[]>([]);
  let loaded = $state(false);
  let addTopicId = $state('');

  const titleById = $derived(new Map(topics.map((t) => [t.id, t.title])));
  const available = $derived(topics.filter((t) => !slots.some((s) => s.topic_id === t.id)));

  $effect(() => {
    const id = trackId;
    loaded = false;
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await listCycleSlots(db, id);
      if (cancelled) return;
      slots = rows.map((r) => ({ topic_id: r.topic_id, weight: r.weight }));
      loaded = true;
    })();
    return () => {
      cancelled = true;
      flushNow(); // persist pending edits of the previous track before reloading
    };
  });

  async function persist(id: string, next: LocalSlot[]): Promise<void> {
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await setCycleSlots(db, deviceId, id, next);
  }

  // setCycleSlots is replace-all, so weight typing would cause a write storm —
  // debounce and flush on unmount / track change.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  function schedulePersist() {
    const id = trackId;
    const snapshot = slots.map((s) => ({ ...s }));
    const run = () => {
      timer = null;
      pending = null;
      void persist(id, snapshot);
    };
    if (timer !== null) clearTimeout(timer);
    pending = run;
    timer = setTimeout(run, 400);
  }

  function flushNow() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const run = pending;
    pending = null;
    run?.();
  }

  onDestroy(flushNow);

  function setWeight(topicId: string, value: number) {
    if (Number.isNaN(value)) return; // mid-edit empty field — keep last valid weight
    const weight = Math.min(5, Math.max(1, Math.round(value)));
    slots = slots.map((s) => (s.topic_id === topicId ? { ...s, weight } : s));
    schedulePersist();
  }

  function removeSlot(topicId: string) {
    slots = slots.filter((s) => s.topic_id !== topicId);
    schedulePersist();
  }

  function onadd(event: SubmitEvent) {
    event.preventDefault();
    if (addTopicId === '') return;
    slots = [...slots, { topic_id: addTopicId, weight: 1 }];
    addTopicId = '';
    schedulePersist();
  }
</script>

<section data-testid="cycle-editor">
  <p class="type-meta mt-2 text-text-soft">peso maior · aparece mais vezes no ciclo</p>

  {#if !loaded}
    <p class="type-item mt-3 text-text-soft">carregando…</p>
  {:else}
    <ul role="list" class="mt-4">
      {#each slots as slot (slot.topic_id)}
        <li
          data-testid="cycle-slot"
          class="flex items-center gap-3 border-b border-hairline py-3 first:border-t"
        >
          <span class="type-item min-w-0 flex-1 truncate text-text-body">
            {titleById.get(slot.topic_id) ?? 'tópico removido'}
          </span>
          <label class="type-meta text-text-low" for={`cycle-weight-${slot.topic_id}`}>
            peso
          </label>
          <input
            id={`cycle-weight-${slot.topic_id}`}
            data-testid="cycle-weight-input"
            type="number"
            min="1"
            max="5"
            value={slot.weight}
            oninput={(e) => setWeight(slot.topic_id, e.currentTarget.valueAsNumber)}
            class="type-item h-(--h-button-md) w-16 shrink-0 rounded-base border border-border bg-surface px-2 text-text-body"
          />
          <button
            data-testid="cycle-remove"
            type="button"
            aria-label="remover do ciclo"
            onclick={() => removeSlot(slot.topic_id)}
            class="shrink-0 cursor-pointer leading-none text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            ×
          </button>
        </li>
      {/each}
    </ul>

    {#if slots.length === 0}
      <p class="type-item mt-2 text-text-soft">
        nenhum tópico no ciclo ainda — adicione o primeiro.
      </p>
    {/if}

    <form class="mt-4 flex gap-2" onsubmit={onadd}>
      <label class="sr-only" for="cycle-add-topic">adicionar tópico ao ciclo</label>
      <div class="min-w-0 flex-1">
        <SelectSearch
          options={available.map((t) => ({ value: t.id, label: t.title }))}
          bind:value={addTopicId}
          testid="cycle-add-select"
          ariaLabel="tópico para o ciclo"
          placeholder="escolha um tópico"
        />
      </div>
      <button
        data-testid="cycle-add-submit"
        type="submit"
        class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        adicionar
      </button>
    </form>
  {/if}
</section>
