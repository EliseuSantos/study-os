<script lang="ts">
  // Categorical composition as ONE stacked horizontal bar (Chart.js), with the
  // always-visible HTML legend below — identity is never color-alone (brand
  // palette fails generic lightness bands by design; validated CVD ΔE ≥ 15).
  import { onDestroy, onMount } from 'svelte';
  import type { Chart } from 'chart.js';
  import { chartTheme, onThemeChange } from './theme';

  interface Slice {
    label: string;
    minutes: number;
  }

  let { slices, ariaLabel }: { slices: Slice[]; ariaLabel: string } = $props();

  const total = $derived(slices.reduce((n, s) => n + s.minutes, 0));
  const visible = $derived(slices.filter((s) => s.minutes > 0));

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart<'bar'> | null = null;
  let stopTheme: (() => void) | null = null;

  function palette(): string[] {
    const t = chartTheme();
    return [t.accent, t.accentDim, t.success, t.textLow];
  }

  function fmt(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  function colorOf(slice: Slice): string {
    const i = slices.findIndex((s) => s.label === slice.label);
    const colors = palette();
    return colors[i % colors.length] ?? colors[0]!;
  }

  async function build() {
    // chart.js loads on demand — it never rides the critical bundle
    const { default: ChartJS } = await import('chart.js/auto');
    if (canvas === null || visible.length === 0) return;
    const t = chartTheme();
    chart?.destroy();
    chart = new ChartJS(canvas, {
      type: 'bar',
      data: {
        labels: [''],
        datasets: visible.map((slice) => ({
          label: slice.label,
          data: [slice.minutes],
          backgroundColor: colorOf(slice),
          borderColor: t.bgDeep,
          borderWidth: { left: 0, right: 2, top: 0, bottom: 0 },
          borderSkipped: false,
          borderRadius: 3,
          barThickness: 14,
        })),
      },
      options: {
        indexAxis: 'y',
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
            callbacks: {
              title: () => '',
              label: (item) => `${item.dataset.label} · ${fmt(Number(item.raw))}`,
            },
          },
        },
        scales: {
          x: { stacked: true, display: false },
          y: { stacked: true, display: false },
        },
      },
    });
  }

  onMount(() => {
    stopTheme = onThemeChange(() => void build());
  });

  // The canvas mounts late (behind {#if total}); build whenever it exists.
  $effect(() => {
    void slices;
    if (canvas !== null) void build();
  });

  onDestroy(() => {
    stopTheme?.();
    chart?.destroy();
  });
</script>

{#if total > 0}
  <div role="img" aria-label={ariaLabel}>
    <div class="relative h-6 w-full">
      <canvas bind:this={canvas}></canvas>
    </div>
    <ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
      {#each visible as slice (slice.label)}
        <li class="flex items-center gap-2 text-[11.5px] text-text-mid">
          <span
            class="h-2 w-2 shrink-0 rounded-[2px]"
            style="background:{colorOf(slice)}"
            aria-hidden="true"
          ></span>
          {slice.label}
          <span class="ml-auto text-text-low tabular-nums">
            {fmt(slice.minutes)} · {Math.round((slice.minutes / total) * 100)}%
          </span>
        </li>
      {/each}
    </ul>
  </div>
{:else}
  <p class="type-meta py-4 text-center text-text-soft">registre sessões para ver a distribuição.</p>
{/if}
