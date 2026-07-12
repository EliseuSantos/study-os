<script lang="ts">
  // Net minutes/day as a Chart.js line — one amber series, soft area fill,
  // recessive grid, themed tooltip.
  import { onDestroy, onMount } from 'svelte';
  import type { Chart } from 'chart.js';
  import { chartTheme, onThemeChange, withAlpha } from './theme';

  interface Point {
    day: number;
    minutes: number;
  }

  let { points, ariaLabel }: { points: Point[]; ariaLabel: string } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart<'line'> | null = null;
  let stopTheme: (() => void) | null = null;

  function dayLabel(ms: number): string {
    return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function fmt(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  async function build() {
    // chart.js loads on demand — it never rides the critical bundle
    const { default: ChartJS } = await import('chart.js/auto');
    if (canvas === null) return;
    const t = chartTheme();
    chart?.destroy();
    chart = new ChartJS(canvas, {
      type: 'line',
      data: {
        labels: points.map((p) => dayLabel(p.day)),
        datasets: [
          {
            data: points.map((p) => p.minutes),
            borderColor: t.accent,
            borderWidth: 2,
            pointRadius: points.map((_, i) => (i === points.length - 1 ? 3.5 : 0)),
            pointBackgroundColor: t.accent,
            pointHoverRadius: 4.5,
            pointHoverBackgroundColor: t.accent,
            pointHoverBorderColor: t.bgDeep,
            pointHoverBorderWidth: 2,
            fill: true,
            backgroundColor: withAlpha(t.accent, 0.14),
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
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
            border: { color: t.hairline },
            ticks: {
              color: t.textLow,
              font: { family: t.font, size: 9 },
              maxTicksLimit: 6,
              maxRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax: 30,
            grid: { color: t.hairline, tickLength: 0 },
            border: { display: false },
            ticks: {
              color: t.textLow,
              font: { family: t.font, size: 9 },
              maxTicksLimit: 3,
              callback: (value) => fmt(Number(value)),
            },
          },
        },
      },
    });
  }

  onMount(() => {
    stopTheme = onThemeChange(() => void build());
  });

  // The canvas mounts late (behind {#if data}); build whenever it exists.
  $effect(() => {
    void points;
    if (canvas !== null) void build();
  });

  onDestroy(() => {
    stopTheme?.();
    chart?.destroy();
  });
</script>

{#if points.length > 1}
  <div class="relative h-36 w-full" role="img" aria-label={ariaLabel}>
    <canvas bind:this={canvas}></canvas>
  </div>
{:else}
  <p class="type-meta py-6 text-center text-text-soft">
    sem sessões ainda — os dias aparecem aqui.
  </p>
{/if}
