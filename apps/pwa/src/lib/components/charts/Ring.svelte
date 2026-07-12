<script lang="ts">
  // Doughnut progress ring (Chart.js) with a DOM-centered label.
  import { onDestroy, onMount } from 'svelte';
  import type { Chart } from 'chart.js';
  import { chartTheme, onThemeChange } from './theme';

  let {
    pct,
    label,
    sublabel = null,
    size = 116,
    ariaLabel,
  }: {
    pct: number;
    label: string;
    sublabel?: string | null;
    size?: number;
    ariaLabel: string;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart<'doughnut'> | null = null;
  let stopTheme: (() => void) | null = null;

  function data() {
    const t = chartTheme();
    const clamped = Math.max(0, Math.min(100, pct));
    return {
      datasets: [
        {
          data: [clamped, 100 - clamped],
          backgroundColor: [t.accent, t.hairline],
          borderWidth: 0,
          borderRadius: clamped > 0 && clamped < 100 ? 6 : 0,
        },
      ],
    };
  }

  onMount(async () => {
    const { default: ChartJS } = await import('chart.js/auto');
    if (canvas === null) return;
    chart = new ChartJS(canvas, {
      type: 'doughnut',
      data: data(),
      options: {
        responsive: false,
        cutout: '76%',
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { animateRotate: true, duration: 700 },
      },
    });
    stopTheme = onThemeChange(() => {
      if (chart === null) return;
      chart.data = data();
      chart.update('none');
    });
  });

  $effect(() => {
    void pct;
    if (chart === null) return;
    chart.data = data();
    chart.update();
  });

  onDestroy(() => {
    stopTheme?.();
    chart?.destroy();
  });
</script>

<div class="relative inline-block" style="width:{size}px;height:{size}px" role="img" aria-label={ariaLabel}>
  <canvas bind:this={canvas} width={size} height={size}></canvas>
  <div class="pointer-events-none absolute inset-0 grid place-items-center text-center">
    <span>
      <b class="block text-[20px] font-semibold text-text-hi tabular-nums">{label}</b>
      {#if sublabel !== null}
        <span class="type-label block text-text-low">{sublabel}</span>
      {/if}
    </span>
  </div>
</div>
