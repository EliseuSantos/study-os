<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createStatsStore } from '$lib/stores/stats.svelte';

  const store = createStatsStore();

  const streak = $derived(store.data.streak);

  onDestroy(() => {
    store.destroy();
  });

  function heatBackground(level: number): string {
    return level === 0 ? 'transparent' : `var(--heat-${level})`;
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
