<script lang="ts">
  import { onDestroy } from 'svelte';
  import { DAY_MS, netSecondsPerDay } from '@studyos/core';
  import { sessionSlices } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { createStatsStore } from '$lib/stores/stats.svelte';
  import { downloadProgressImage, type HeatLevel } from '$lib/stats/progress-image';

  const store = createStatsStore();

  const streak = $derived(store.data.streak);

  let generating = $state(false);

  onDestroy(() => {
    store.destroy();
  });

  function heatBackground(level: number): string {
    return level === 0 ? 'transparent' : `var(--heat-${level})`;
  }

  function heatLevel(level: number): HeatLevel {
    return level <= 0 ? 0 : level === 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4;
  }

  // The live store keeps only bucketed levels, so re-derive the net total
  // over the same 12-week grid for the image caption.
  async function shareProgress(): Promise<void> {
    if (generating) return;
    generating = true;
    try {
      const db = await getDb();
      const now = Date.now();
      const sessions = await sessionSlices(db, now - 84 * DAY_MS);
      const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
      const weekStart = todayMidnight - new Date(todayMidnight).getDay() * DAY_MS;
      const gridStart = weekStart - 11 * 7 * DAY_MS;
      const perDay = netSecondsPerDay(sessions, gridStart, gridStart + 83 * DAY_MS);
      const totalSeconds = perDay.reduce((sum, d) => sum + d.seconds, 0);
      await downloadProgressImage({
        streak: store.data.streak,
        totalHours: Math.round(totalSeconds / 3600),
        heat: store.data.heatmap.map((cell) => ({
          level: cell.future ? 0 : heatLevel(cell.level),
        })),
      });
    } finally {
      generating = false;
    }
  }
</script>

<svelte:head>
  <title>StudyOS — estatísticas</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">estatísticas</p>
  <h1 class="type-h1 mt-2 text-text-hi">o que os números dizem</h1>

  <h2 class="type-label mt-10 text-text-low">últimas 12 semanas</h2>
  <div
    data-testid="stats-heatmap"
    class="heat-grid mt-3"
    role="img"
    aria-label="mapa de calor de estudo das últimas 12 semanas"
  >
    {#each store.data.heatmap as cell (cell.day)}
      <div
        class="heat-cell"
        class:heat-empty={cell.level === 0}
        class:invisible={cell.future}
        style="background: {heatBackground(cell.level)}"
      ></div>
    {/each}
  </div>

  <button
    data-testid="share-progress"
    type="button"
    disabled={generating}
    onclick={() => void shareProgress()}
    class="type-meta mt-4 cursor-pointer rounded-chip border border-border px-3 py-1.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-default disabled:opacity-60"
  >
    gerar imagem de progresso
  </button>

  <h2 class="type-label mt-10 text-text-low">constância</h2>
  <p data-testid="stats-streak" class="type-h1 mt-2 text-text-hi">
    {streak}
    {streak === 1 ? 'dia' : 'dias'} de constância
  </p>

  <h2 class="type-label mt-10 text-text-low">comparativo</h2>
  <p data-testid="stats-comparison" class="type-item mt-2 text-text-body">
    {store.data.comparison}
  </p>

  <h2 class="type-label mt-10 text-text-low">acerto por trilha</h2>
  <ul data-testid="stats-accuracy" class="mt-2">
    {#each store.data.accuracy as row (row.key)}
      <li
        data-testid="stats-accuracy-row"
        class="type-item border-b border-hairline py-3 text-text-body first:border-t"
      >
        {row.label}
      </li>
    {/each}
  </ul>
  {#if store.data.accuracy.length === 0}
    <p class="type-item mt-2 text-text-soft">sem questões registradas ainda.</p>
  {/if}

  <h2 class="type-label mt-10 text-text-low">pontos fracos</h2>
  <ul data-testid="stats-weak" class="mt-2">
    {#each store.data.weak as row (row.key)}
      <li
        data-testid="stats-weak-row"
        class="type-item border-b border-hairline py-3 text-text-body first:border-t"
      >
        {row.label}
      </li>
    {/each}
  </ul>
  {#if store.data.weak.length === 0}
    <p class="type-item mt-2 text-text-soft">ainda sem dados suficientes.</p>
  {/if}
</section>

<style>
  .heat-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(7, 10px);
    grid-auto-columns: 10px;
    gap: 3px;
  }

  .heat-cell {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .heat-empty {
    border: 1px solid var(--hairline);
  }
</style>
