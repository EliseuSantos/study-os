<script lang="ts">
  // Small categorical bar chart (Chart.js): one amber series, rounded tops,
  // the highlighted index (e.g. today) in full accent.
  import { onDestroy, onMount } from 'svelte';
  import type { Chart } from 'chart.js';
  import { chartTheme, onThemeChange, withAlpha } from './theme';

  interface Bar {
    label: string;
    value: number;
    highlight?: boolean;
  }

  let {
    bars,
    ariaLabel,
    height = 72,
    fmt = (v: number) => String(v),
  }: {
    bars: Bar[];
    ariaLabel: string;
    height?: number;
    fmt?: (value: number) => string;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart<'bar'> | null = null;
  let stopTheme: (() => void) | null = null;

  async function build() {
    // chart.js loads on demand — it never rides the critical bundle
    const { default: ChartJS } = await import('chart.js/auto');
    if (canvas === null) return;
    const t = chartTheme();
    chart?.destroy();
    chart = new ChartJS(canvas, {
      type: 'bar',
      data: {
        labels: bars.map((b) => b.label),
        datasets: [
          {
            data: bars.map((b) => b.value),
            backgroundColor: bars.map((b) =>
              b.highlight ? t.accent : withAlpha(t.accent, 0.28),
            ),
            hoverBackgroundColor: t.accent,
            borderRadius: 3,
            borderSkipped: 'bottom',
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: t.bgDeep,
            borderColor: t.border,
            borderWidth: 1,
            titleColor: t.textLow,
            bodyColor: t.textBody,
            titleFont: { family: t.font, size: 10 },
            bodyFont: { family: t.font, size: 12 },
            displayColors: false,
            padding: 8,
            callbacks: { label: (item) => fmt(Number(item.raw)) },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: t.textLow, font: { family: t.font, size: 9 } },
          },
          y: { display: false, beginAtZero: true },
        },
      },
    });
  }

  onMount(() => {
    stopTheme = onThemeChange(() => void build());
  });

  // The canvas mounts late (behind {#if data}); build whenever it exists.
  $effect(() => {
    void bars;
    if (canvas !== null) void build();
  });

  onDestroy(() => {
    stopTheme?.();
    chart?.destroy();
  });
</script>

<div class="relative w-full" style="height:{height}px" role="img" aria-label={ariaLabel}>
  <canvas bind:this={canvas}></canvas>
</div>
