<script lang="ts">
  // Projected study timeline: the real planner (allocateSchedule) runs over the
  // user's routines for this track across the next 4 weeks; each topic's bar
  // spans its first to last projected block. Done topics show as completed rows.
  import { DAY_MS, allocateSchedule, parseRrule, type PlannerTopic } from '@studyos/core';
  import { listRoutines, plannerTopics, type DbDriver } from '@studyos/db';
  import { liveQuery } from '$lib/db/live.svelte';

  let { trackId }: { trackId: string } = $props();

  const DAYS = 28;

  interface GanttRow {
    id: string;
    title: string;
    startCol: number; // 1-based grid column
    span: number;
    done: boolean;
  }

  interface GanttData {
    rows: GanttRow[];
    weekLabels: string[];
    todayCol: number;
    hasRoutine: boolean;
  }

  const EMPTY: GanttData = { rows: [], weekLabels: [], todayCol: 1, hasRoutine: false };

  async function load(db: DbDriver): Promise<GanttData> {
    const [routines, topics] = await Promise.all([listRoutines(db), plannerTopics(db, [trackId])]);

    const specs = routines
      .filter((r) => r.track_id === trackId)
      .map((r) => {
        let days: number[] = [];
        try {
          days = parseRrule(r.rrule);
        } catch {
          // outside the supported subset — skip silently
        }
        return {
          id: r.id,
          track_id: r.track_id,
          days,
          start_time: r.start_time,
          duration_min: r.duration_min,
        };
      })
      .filter((r) => r.days.length > 0);

    const today = new Date().setHours(0, 0, 0, 0);
    const weekLabels = Array.from({ length: DAYS / 7 }, (_, week) =>
      new Date(today + week * 7 * DAY_MS).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
    );

    const doneRows: GanttRow[] = topics
      .filter((t) => t.status === 'done')
      .map((t) => ({ id: t.id, title: t.title, startCol: 1, span: 0, done: true }));

    let planned: GanttRow[] = [];
    if (specs.length > 0) {
      const planner: PlannerTopic[] = topics.map((t) => ({
        id: t.id,
        track_id: t.track_id,
        title: t.title,
        status: t.status,
        position: t.position,
        deps: t.deps,
      }));
      const blocks = allocateSchedule(specs, planner, today, today + (DAYS - 1) * DAY_MS);
      const byTopic = new Map<string, { title: string; min: number; max: number }>();
      for (const block of blocks) {
        if (block.topic_id === null) continue;
        const entry = byTopic.get(block.topic_id);
        if (entry) {
          entry.min = Math.min(entry.min, block.day);
          entry.max = Math.max(entry.max, block.day);
        } else {
          byTopic.set(block.topic_id, { title: block.title, min: block.day, max: block.day });
        }
      }
      planned = [...byTopic.entries()].map(([id, entry]) => {
        const startCol = Math.round((entry.min - today) / DAY_MS) + 1;
        const endCol = Math.round((entry.max - today) / DAY_MS) + 1;
        return { id, title: entry.title, startCol, span: endCol - startCol + 1, done: false };
      });
      planned.sort((a, b) => a.startCol - b.startCol || a.title.localeCompare(b.title));
    }

    return {
      rows: [...planned, ...doneRows],
      weekLabels,
      todayCol: 1,
      hasRoutine: specs.length > 0,
    };
  }

  const live = liveQuery((db) => load(db), ['topics', 'routines', 'topic_deps'], EMPTY);
  const data = $derived(live.value);

  $effect(() => () => live.destroy());
</script>

<div data-testid="track-gantt">
  {#if !data.hasRoutine}
    <p class="type-item text-text-soft">
      para projetar o cronograma, crie uma
      <a href="/routines" class="text-text-mid underline underline-offset-2 hover:text-text-hi">
        rotina
      </a>
      ligada a esta trilha.
    </p>
  {:else if data.rows.length === 0}
    <p class="type-item text-text-soft">nenhum tópico para projetar ainda.</p>
  {:else}
    <div class="overflow-x-auto pb-1">
      <div class="gantt" style="--days:{DAYS}">
        <!-- week header -->
        <div class="g-label"></div>
        <div class="g-lane g-head">
          {#each data.weekLabels as label, week (label + week)}
            <span class="g-week" style="grid-column: {week * 7 + 1} / span 7">sem {label}</span>
          {/each}
        </div>

        {#each data.rows as row (row.id)}
          <div class="g-label" title={row.title}>
            {#if row.done}<span class="g-check">✓</span>{/if}
            <span class="truncate {row.done ? 'text-text-low line-through' : 'text-text-body'}">
              {row.title}
            </span>
          </div>
          <div class="g-lane">
            {#if row.done}
              <span class="g-bar g-done" style="grid-column: 1 / span {DAYS}"></span>
            {:else}
              <span
                class="g-bar"
                style="grid-column: {row.startCol} / span {row.span}"
                title={row.title}
              ></span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    <p class="type-meta mt-2.5 flex items-center gap-4 text-text-low">
      <span class="flex items-center gap-1.5">
        <span class="g-key g-key-accent" aria-hidden="true"></span>projetado pelas rotinas
      </span>
      <span class="flex items-center gap-1.5">
        <span class="g-key g-key-done" aria-hidden="true"></span>concluído
      </span>
    </p>
  {/if}
</div>

<style>
  .gantt {
    display: grid;
    grid-template-columns: minmax(120px, 180px) minmax(420px, 1fr);
    row-gap: 6px;
    align-items: center;
  }
  .g-label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-right: 10px;
    font: var(--type-meta);
  }
  .g-check {
    color: var(--success);
    font-size: 10px;
  }
  .g-lane {
    display: grid;
    grid-template-columns: repeat(var(--days), minmax(14px, 1fr));
    background-image: repeating-linear-gradient(
      to right,
      var(--hairline) 0 1px,
      transparent 1px calc(100% / 4)
    );
    border-radius: 3px;
  }
  .g-head {
    background: none;
  }
  .g-week {
    font: 400 9.5px var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-low);
    padding-bottom: 2px;
    font-variant-numeric: tabular-nums;
  }
  .g-bar {
    height: 14px;
    border-radius: 4px;
    background: var(--accent-tint-12);
    border-left: 3px solid var(--accent);
  }
  .g-done {
    background: none;
    border-left: none;
    border-bottom: 1px dashed var(--hairline);
    height: 8px;
  }
  .g-key {
    display: inline-block;
    width: 14px;
    height: 8px;
    border-radius: 2px;
  }
  .g-key-accent {
    background: var(--accent-tint-12);
    border-left: 3px solid var(--accent);
  }
  .g-key-done {
    border-bottom: 1px dashed var(--hairline);
    border-radius: 0;
  }
</style>
