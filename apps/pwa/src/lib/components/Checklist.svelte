<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    addChecklistItem,
    deleteChecklistItem,
    getOrCreateDeviceId,
    listChecklist,
    toggleChecklistItem,
  } from '@studyos/db';
  import type { ChecklistItemRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { liveQuery } from '$lib/db/live.svelte';

  let { refKind, refId }: { refKind: string; refId: string } = $props();

  const live = liveQuery(
    (db) => listChecklist(db, refKind, refId),
    ['checklist_items'],
    [] as ChecklistItemRow[],
  );

  let title = $state('');

  const doneCount = $derived(live.value.filter((i) => i.done === 1).length);

  onDestroy(() => live.destroy());

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    title = '';
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await addChecklistItem(db, deviceId, { ref_kind: refKind, ref_id: refId, title: trimmed });
    await live.refresh();
  }

  async function toggle(item: ChecklistItemRow) {
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await toggleChecklistItem(db, deviceId, item.id, item.done === 0);
    await live.refresh();
  }

  async function remove(id: string) {
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await deleteChecklistItem(db, deviceId, id);
    await live.refresh();
  }
</script>

<div data-testid="checklist">
  {#if live.value.length > 0}
    <p class="type-meta mb-1 text-right text-text-low tabular-nums" aria-live="polite">
      {doneCount}/{live.value.length}
    </p>
  {/if}
  <ul>
    {#each live.value as item, i (item.id)}
      <li data-testid="checklist-item" class="check-row {i === live.value.length - 1 ? 'check-row-last' : ''}">
        <span class="check-rail" aria-hidden="true"></span>
        <button
          data-testid="checklist-toggle"
          type="button"
          role="checkbox"
          aria-checked={item.done === 1}
          aria-label={item.title}
          onclick={() => void toggle(item)}
          class="check-box {item.done === 1 ? 'check-box-done' : ''}"
        >
          {#if item.done === 1}✓{/if}
        </button>
        <span
          class="type-item flex-1 py-2 transition-colors duration-(--dur-base) ease-brand {item.done === 1
            ? 'text-text-soft line-through decoration-hairline'
            : 'text-text-body'}"
        >
          {item.title}
        </span>
        <button
          data-testid="checklist-remove"
          type="button"
          aria-label="remover"
          onclick={() => void remove(item.id)}
          class="type-meta h-6 w-6 shrink-0 cursor-pointer self-center rounded-micro text-text-low opacity-0 transition-all duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          ×
        </button>
      </li>
    {/each}
  </ul>

  <form class="mt-3 flex gap-2" onsubmit={add}>
    <input
      data-testid="checklist-add-input"
      type="text"
      bind:value={title}
      aria-label="novo item"
      placeholder="adicionar item"
      autocomplete="off"
      class="type-item h-(--h-button-sm) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
    />
    <button
      data-testid="checklist-add-submit"
      type="submit"
      class="h-(--h-button-sm) shrink-0 cursor-pointer rounded-base border border-border px-3 text-[13px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      adicionar
    </button>
  </form>
</div>

<style>
  /* Progress timeline: circles chained by a vertical rail (learnspring-style). */
  .check-row {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 2px 0;
  }
  .check-row:hover > [data-testid='checklist-remove'] {
    opacity: 1;
  }
  .check-rail {
    position: absolute;
    left: 10px;
    top: 26px;
    bottom: -6px;
    width: 1.5px;
    background: var(--hairline);
  }
  .check-row-last .check-rail {
    display: none;
  }

  /* The checklist check — "the only healthy dopamine moment", 160ms. */
  .check-box {
    width: 21px;
    height: 21px;
    margin-top: 7px;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    cursor: pointer;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--accent-ink);
    font: 600 12px/1 var(--font-display);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color var(--dur-base) var(--ease),
      border-color var(--dur-base) var(--ease),
      transform var(--dur-base) var(--ease);
  }
  .check-box:hover {
    border-color: var(--accent);
  }
  .check-box:active {
    transform: scale(0.9);
  }

  .check-box-done {
    background: var(--accent);
    border-color: var(--accent);
  }
</style>
