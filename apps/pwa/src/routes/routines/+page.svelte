<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { parseRrule } from '@studyos/core';
  import type { RoutineRow } from '@studyos/shared';
  import { createRoutinesStore } from '$lib/stores/routines.svelte';

  const DAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const store = createRoutinesStore();
  onDestroy(() => store.destroy());

  let title = $state('');
  const selectedDays = new SvelteSet<number>();
  let startTime = $state('09:00');
  let durationMin = $state(60);
  let trackId = $state('');

  const trackTitleById = $derived(new Map(store.tracks.map((t) => [t.id, t.title])));

  // listRoutines comes ordered by start_time, so each column stays sorted.
  const columns = $derived.by(() => {
    const byDay: RoutineRow[][] = Array.from({ length: 7 }, () => []);
    for (const routine of store.routines) {
      let days: number[];
      try {
        days = parseRrule(routine.rrule);
      } catch {
        continue; // outside the supported subset — skip silently
      }
      for (const day of days) byDay[day]?.push(routine);
    }
    return byDay;
  });

  function toggleDay(day: number) {
    if (selectedDays.has(day)) selectedDays.delete(day);
    else selectedDays.add(day);
  }

  function formatDuration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    const days = [...selectedDays];
    if (!title.trim() || days.length === 0 || !startTime) return;
    void store.add({
      title,
      track_id: trackId === '' ? null : trackId,
      days,
      start_time: startTime,
      duration_min: durationMin,
    });
    title = '';
    selectedDays.clear();
  }
</script>

<svelte:head>
  <title>StudyOS — rotinas</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">estudo</p>
  <h1 class="type-h1 mt-2 text-text-hi">rotinas</h1>

  <form data-testid="routine-form" class="mt-8" {onsubmit}>
    <label class="type-label block text-text-low" for="routine-title">nova rotina</label>
    <input
      id="routine-title"
      data-testid="routine-title-input"
      type="text"
      bind:value={title}
      placeholder="ex.: revisão de constitucional"
      autocomplete="off"
      class="type-item mt-3 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
    />

    <p class="type-label mt-4 text-text-low" id="routine-days-label">dias da semana</p>
    <div
      data-testid="routine-days"
      role="group"
      aria-labelledby="routine-days-label"
      class="mt-2 flex flex-wrap gap-2"
    >
      {#each DAY_LABELS as label, day (day)}
        <button
          data-testid={`routine-day-${day}`}
          type="button"
          aria-pressed={selectedDays.has(day)}
          onclick={() => toggleDay(day)}
          class="type-meta h-(--h-button-md) cursor-pointer rounded-chip border px-3 transition-colors duration-(--dur-base) ease-brand {selectedDays.has(
            day,
          )
            ? 'border-accent bg-accent text-accent-ink'
            : 'border-border text-text-mid hover:text-text-hi'}"
        >
          {label}
        </button>
      {/each}
    </div>

    <div class="mt-4 flex flex-wrap gap-4">
      <div>
        <label class="type-label block text-text-low" for="routine-start">início</label>
        <input
          id="routine-start"
          data-testid="routine-start-input"
          type="time"
          bind:value={startTime}
          class="type-item mt-2 h-(--h-button-md) rounded-base border border-border bg-surface px-3 text-text-body"
        />
      </div>
      <div>
        <label class="type-label block text-text-low" for="routine-duration">
          duração · minutos
        </label>
        <input
          id="routine-duration"
          data-testid="routine-duration-input"
          type="number"
          min="5"
          step="5"
          bind:value={durationMin}
          class="type-item mt-2 h-(--h-button-md) w-24 rounded-base border border-border bg-surface px-3 text-text-body"
        />
      </div>
      <div class="min-w-0 flex-1">
        <label class="type-label block text-text-low" for="routine-track">trilha</label>
        <select
          id="routine-track"
          data-testid="routine-track-select"
          bind:value={trackId}
          class="type-item mt-2 h-(--h-button-md) w-full min-w-40 cursor-pointer rounded-base border border-border bg-surface px-3 text-text-body"
        >
          <option value="">estudo livre</option>
          {#each store.tracks as track (track.id)}
            <option value={track.id}>{track.title}</option>
          {/each}
        </select>
      </div>
    </div>

    <button
      data-testid="routine-submit"
      type="submit"
      class="mt-4 h-(--h-button-md) cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      criar rotina
    </button>
  </form>

  <h2 class="type-label mt-10 text-text-low">semana</h2>
  <div class="mt-3 overflow-x-auto pb-2">
    <div data-testid="routine-grid" class="grid min-w-[560px] grid-cols-7 gap-2">
      {#each DAY_LABELS as label, day (day)}
        <div class="min-w-0">
          <p class="type-label text-center text-text-low">{label}</p>
          <ul role="list" class="mt-2 flex flex-col gap-2">
            {#each columns[day] ?? [] as routine (routine.id)}
              <li
                data-testid="routine-block"
                class="min-w-0 rounded-base border border-hairline bg-surface p-2"
              >
                <div class="flex items-start justify-between gap-1">
                  <p class="type-meta min-w-0 truncate font-semibold text-text-hi">
                    {routine.title}
                  </p>
                  <button
                    data-testid="routine-delete"
                    type="button"
                    aria-label="remover rotina"
                    onclick={() => void store.remove(routine.id)}
                    class="shrink-0 cursor-pointer leading-none text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                  >
                    ×
                  </button>
                </div>
                <p class="type-meta mt-1 text-text-mid">
                  {routine.start_time} · {formatDuration(routine.duration_min)}
                </p>
                {#if routine.track_id !== null && trackTitleById.has(routine.track_id)}
                  <p class="type-meta mt-1 truncate text-text-low">
                    {trackTitleById.get(routine.track_id)}
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>

  {#if store.routines.length === 0}
    <p class="type-item mt-2 text-text-soft">nenhuma rotina ainda — monte sua semana de estudo.</p>
  {/if}
</section>
