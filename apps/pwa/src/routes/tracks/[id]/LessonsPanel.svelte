<script lang="ts">
  import { untrack } from 'svelte';
  import { createLesson, deleteLesson, getOrCreateDeviceId, listLessons } from '@studyos/db';
  import type { LessonRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { liveQuery, type LiveQuery } from '$lib/db/live.svelte';

  let { trackId }: { trackId: string } = $props();

  let live = $state.raw<LiveQuery<LessonRow[]> | null>(null);

  $effect(() => {
    const next = liveQuery((db) => listLessons(db, trackId), ['lessons'], [] as LessonRow[]);
    untrack(() => {
      live = next;
    });
    return () => next.destroy();
  });

  const lessons = $derived(live?.value ?? []);

  let title = $state('');
  let duration = $state<number | null>(null);

  function onDurationInput(event: Event & { currentTarget: HTMLInputElement }) {
    const n = event.currentTarget.valueAsNumber;
    duration = Number.isNaN(n) ? null : Math.max(1, Math.round(n));
  }

  async function addLesson(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const estimated = duration;
    title = '';
    duration = null;
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await createLesson(db, deviceId, {
      track_id: trackId,
      title: trimmed,
      estimated_duration_min: estimated,
    });
    await live?.refresh();
  }

  async function removeLesson(id: string) {
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await deleteLesson(db, deviceId, id);
    await live?.refresh();
  }
</script>

<section data-testid="lessons-panel" class="mt-12">
  <h2 class="type-label text-text-low">
    aulas{lessons.length > 0 ? ` · ${lessons.length}` : ''}
  </h2>

  <ul data-testid="lesson-list" role="list" class="mt-4">
    {#each lessons as lesson (lesson.id)}
      <li
        data-testid="lesson-item-row"
        class="flex items-center gap-3 border-b border-hairline py-3 first:border-t"
      >
        <a
          href={`/tracks/${trackId}/lessons/${lesson.id}`}
          class="type-item min-w-0 flex-1 truncate text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          {lesson.title}
        </a>
        {#if lesson.estimated_duration_min !== null}
          <span class="type-meta shrink-0 text-text-low tabular-nums">
            ~{lesson.estimated_duration_min}min
          </span>
        {/if}
        <button
          data-testid="lesson-delete"
          type="button"
          aria-label={`excluir aula ${lesson.title}`}
          onclick={() => void removeLesson(lesson.id)}
          class="shrink-0 cursor-pointer leading-none text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          ×
        </button>
      </li>
    {/each}
  </ul>

  {#if lessons.length === 0}
    <p class="type-item mt-2 text-text-soft">nenhuma aula ainda — monte a primeira.</p>
  {/if}

  <form data-testid="lesson-add-form" class="mt-4 flex gap-2" onsubmit={addLesson}>
    <label class="sr-only" for="lesson-title">título da aula</label>
    <input
      id="lesson-title"
      data-testid="lesson-title-input"
      type="text"
      bind:value={title}
      autocomplete="off"
      placeholder="ex.: aula 1 — introdução"
      class="type-item h-(--h-button-md) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
    />
    <label class="sr-only" for="lesson-duration">duração em minutos · opcional</label>
    <input
      id="lesson-duration"
      data-testid="lesson-duration-input"
      type="number"
      min="1"
      value={duration ?? ''}
      oninput={onDurationInput}
      placeholder="min"
      class="type-item h-(--h-button-md) w-20 shrink-0 rounded-base border border-border bg-surface px-2 text-text-body tabular-nums placeholder:text-text-low"
    />
    <button
      data-testid="lesson-submit"
      type="submit"
      class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      criar aula
    </button>
  </form>
</section>
