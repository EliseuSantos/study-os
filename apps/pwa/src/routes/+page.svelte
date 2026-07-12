<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { DueReview } from '@studyos/db';
  import { fly } from 'svelte/transition';
  import { DAY_MS, netSecondsPerDay } from '@studyos/core';
  import { sessionSlices } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { createStatsStore } from '$lib/stores/stats.svelte';
  import { downloadProgressImage, type HeatLevel } from '$lib/stats/progress-image';
  import MixBar from '$lib/components/charts/MixBar.svelte';
  import Ring from '$lib/components/charts/Ring.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
  import TrendChart from '$lib/components/charts/TrendChart.svelte';
  import { createProfileStore } from '$lib/stores/profile.svelte';
  import { createTodayStore } from '$lib/stores/today.svelte';

  const today = createTodayStore();
  const profile = createProfileStore();
  const stats = createStatsStore();
  let generating = $state(false);

  const dash = $derived(today.dashboard);
  const reviewCount = $derived(today.items.filter((i) => i.kind === 'review').length);
  const hasBlocks = $derived(today.items.some((i) => i.kind === 'block'));

  // Clock state fills in after mount: the prerendered HTML and the first
  // client render must match (hydration), so time-derived copy starts neutral.
  let clock = $state<Date | null>(null);
  onMount(() => {
    clock = new Date();
  });

  const greeting = $derived.by(() => {
    if (clock === null) return 'olá';
    const h = clock.getHours();
    if (h < 6) return 'boa madrugada';
    if (h < 12) return 'bom dia';
    if (h < 18) return 'boa tarde';
    return 'boa noite';
  });

  const dateLine = $derived.by(() => {
    if (clock === null) return 'hoje';
    const date = clock.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const focus = dash.streakDays > 0 ? ` · dia ${dash.streakDays} de foco` : '';
    return `${date}${focus}`;
  });

  const QUICK = [
    { label: 'objetivo', href: '/goals' },
    { label: 'trilha', href: '/tracks' },
    { label: 'card', href: '/tracks' },
    { label: 'lembrete', href: '/routines' },
  ] as const;

  onDestroy(() => {
    today.destroy();
    profile.destroy();
    stats.destroy();
  });

  function heatLevel(level: number): HeatLevel {
    return level <= 0 ? 0 : level === 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4;
  }

  // Re-derive the net total over the stats 12-week grid for the image caption.
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
        streak: stats.data.streak,
        totalHours: Math.round(totalSeconds / 3600),
        heat: stats.data.heatmap.map((cell) => ({
          level: cell.future ? 0 : heatLevel(cell.level),
        })),
      });
    } finally {
      generating = false;
    }
  }

  function kindDotClass(item: { kind: string }): string {
    if (item.kind === 'review') return 'qdot qdot-review';
    if (item.kind === 'block') return 'qdot qdot-block';
    return 'qdot qdot-reminder';
  }
</script>

<svelte:head>
  <title>StudyOS — hoje</title>
</svelte:head>

<div class="mx-auto w-full max-w-[1120px] px-4 py-6 lg:px-8 lg:py-7">
  <!-- header: greeting left, quick actions right (mindrift top row) -->
  <div class="rise flex flex-wrap items-end justify-between gap-3" style="--rise-i:0">
    <header>
      <p class="type-meta text-text-low">{greeting},</p>
      <h1 class="mt-0.5 text-[25px] font-semibold tracking-tight text-text-hi">
        {profile.name} · hoje
      </h1>
      <p class="type-meta mt-1 text-text-low tabular-nums">{dateLine}</p>
    </header>
    <div data-testid="quick-create" class="flex flex-wrap gap-2">
      {#each QUICK as q (q.label)}
        <a
          href={q.href}
          class="rounded-chip border border-border px-3.5 py-1.5 text-[12px] text-text-mid transition-colors duration-(--dur-base) ease-brand hover:border-text-low hover:text-text-hi"
        >
          <span class="mr-1 font-semibold text-accent">+</span>{q.label}
        </a>
      {/each}
    </div>
  </div>

  <!-- row 1 · three stat cards (mindrift anatomy) -->
  <div class="mt-5 grid gap-4 lg:grid-cols-3">
    <div
      data-testid="stat-tile"
      class="rise card rounded-panel border border-hairline bg-surface px-4 py-4"
      style="--rise-i:1"
    >
      <p class="flex items-center justify-between type-label text-text-low">
        <span class="flex items-center gap-2">
          <span class="mark-bar bg-accent" aria-hidden="true"></span>
          <NavIcon name="flame" size={12} />
          constância
        </span>

      </p>
      <p class="mt-2 text-[28px] font-semibold text-text-hi tabular-nums">
        {dash.streakDays}
        <span class="text-[13px] font-medium text-text-soft">
          {dash.streakDays === 1 ? 'dia' : 'dias'}
        </span>
      </p>
      <div class="barcode mt-2" aria-hidden="true">
        {#each dash.streakBars as min, i (i)}
          <span
            style="opacity:{min > 0 ? Math.min(1, 0.35 + min / 90) : 0.12}; animation-delay:{i * 25}ms"
          ></span>
        {/each}
      </div>
      <div class="mt-3 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-2.5">
        <span class="pr-2">
          <span class="block text-[10px] text-text-low">maior sequência</span>
          <span class="text-[13px] font-semibold text-text-body tabular-nums">{dash.longestStreak} {dash.longestStreak === 1 ? 'dia' : 'dias'}</span>
        </span>
        <span class="px-2">
          <span class="block text-[10px] text-text-low">perdidos na semana</span>
          <span class="text-[13px] font-semibold text-text-body tabular-nums">{dash.missedWeek} {dash.missedWeek === 1 ? 'dia' : 'dias'}</span>
        </span>
        <span class="pl-2">
          <span class="block text-[10px] text-text-low">inatividade</span>
          <span class="text-[13px] font-semibold text-text-body tabular-nums">{dash.inactivePct}%</span>
        </span>
      </div>
    </div>

    <div
      data-testid="stat-tile"
      class="rise card rounded-panel border border-hairline bg-surface px-4 py-4"
      style="--rise-i:2"
    >
      <p class="flex items-center justify-between type-label text-text-low">
        <span class="flex items-center gap-2">
          <span class="mark-bar bg-success" aria-hidden="true"></span>
          <NavIcon name="target" size={12} />
          progresso das trilhas
        </span>
        <a href="/tracks" class="normal-case text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid" aria-label="ver trilhas">→</a>
      </p>
      <p class="mt-2 text-[28px] font-semibold text-text-hi tabular-nums">
        {dash.mastered.total === 0 ? 0 : Math.round((dash.mastered.done / dash.mastered.total) * 100)}<span class="text-[15px] text-text-soft">%</span>
      </p>
      <p class="text-[11px] tabular-nums {dash.doneThisWeek > 0 ? 'text-success' : 'text-text-soft'}">
        {dash.doneThisWeek > 0 ? `+${dash.doneThisWeek} esta semana` : 'nenhum tópico concluído esta semana'}
      </p>
      <div class="mt-3 h-1 rounded-[2px] bg-hairline" aria-hidden="true">
        <span
          class="grow-x block h-1 rounded-[2px] bg-success"
          style="width:{dash.mastered.total === 0 ? 0 : Math.round((dash.mastered.done / dash.mastered.total) * 100)}%"
        ></span>
      </div>
      <div class="mt-3 grid grid-cols-2 divide-x divide-hairline border-t border-hairline pt-2.5">
        <span class="pr-2">
          <span class="block text-[10px] text-text-low">esta semana</span>
          <span class="text-[13px] font-semibold text-text-body tabular-nums">{dash.doneThisWeek} {dash.doneThisWeek === 1 ? 'tópico' : 'tópicos'}</span>
        </span>
        <span class="pl-2">
          <span class="block text-[10px] text-text-low">semana passada</span>
          <span class="text-[13px] font-semibold text-text-body tabular-nums">{dash.doneLastWeek} {dash.doneLastWeek === 1 ? 'tópico' : 'tópicos'}</span>
        </span>
      </div>
    </div>

    <div
      data-testid="stat-tile"
      class="rise card rounded-panel border border-hairline bg-surface px-4 py-4"
      style="--rise-i:3"
    >
      <p class="flex items-center justify-between type-label text-text-low">
        <span class="flex items-center gap-2">
          <span class="mark-bar bg-(--accent-dim)" aria-hidden="true"></span>
          <NavIcon name="clock" size={12} />
          tempo de estudo
        </span>
        <a href="/study" class="normal-case text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid" aria-label="estudar agora">→</a>
      </p>
      <p class="mt-2 text-[28px] font-semibold text-text-hi tabular-nums">{dash.weekLabel}</p>
      {#if dash.deltaPct !== null}
        <p class="text-[11px] tabular-nums {dash.deltaPct >= 0 ? 'text-success' : 'text-text-soft'}">
          {dash.deltaPct >= 0 ? '+' : ''}{dash.deltaPct}% vs semana passada
        </p>
      {/if}
      <ul class="mt-3 flex flex-col gap-1 border-t border-hairline pt-2.5">
        {#each dash.typeMix.slice(0, 3) as slice, i (slice.label)}
          <li class="flex items-center gap-2 text-[11px] text-text-mid">
            <span class="h-1.5 w-1.5 rounded-full {i === 0 ? 'bg-accent' : i === 1 ? 'bg-(--accent-dim)' : 'bg-success'}" aria-hidden="true"></span>
            {slice.label}
            <span class="ml-auto text-text-low tabular-nums">{Math.floor(slice.minutes / 60)}h{String(slice.minutes % 60).padStart(2, '0')}</span>
          </li>
        {:else}
          <li class="text-[11px] text-text-soft">registre sessões para ver a distribuição.</li>
        {/each}
      </ul>
    </div>
  </div>

  <!-- row 2 · full-width year timeline (mindrift progress timeline) -->
  <div class="rise card mt-4 rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:4">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="card-head type-label text-text-low">
          <NavIcon name="calendar" size={12} />
          sua linha do tempo
        </h2>
      <button
        data-testid="share-progress"
        type="button"
        disabled={generating}
        onclick={() => void shareProgress()}
        class="type-meta cursor-pointer rounded-chip border border-border px-3 py-1 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-default disabled:opacity-60"
      >
        gerar imagem de progresso
      </button>
    </div>
    {#if dash.yearHeat.length > 0}
      <div class="year-wrap mt-3 overflow-x-auto pb-1 [&>*]:min-w-[720px]">
        <div class="year-months" aria-hidden="true">
          {#each dash.yearMonths as m (m.label + m.col)}
            <span style="grid-column-start:{m.col + 1}">{m.label}</span>
          {/each}
        </div>
        <div class="year-grid" data-testid="year-heat" role="img" aria-label="dias de estudo no ano">
          {#each dash.yearHeat as cell (cell.day)}
            <span
              class="year-cell"
              class:year-empty={cell.level === 0}
              style={cell.level > 0 ? `background: var(--heat-${Math.min(4, cell.level)})` : ''}
              title={new Date(cell.day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            ></span>
          {/each}
        </div>
      </div>
      <p class="type-meta mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline pt-3 text-text-low tabular-nums">
        <span>✓ {dash.activeDays} {dash.activeDays === 1 ? 'dia ativo' : 'dias ativos'} nos últimos 12 meses</span>
        {#if dash.bestMonth !== null}<span>melhor mês: {dash.bestMonth}</span>{/if}
      </p>
    {:else}
      <p class="type-meta mt-3 text-text-soft">seus dias de estudo vão aparecer aqui.</p>
    {/if}
  </div>

  <!-- row 3 · weekly streak / review ring / tracks (mindrift bottom row) -->
  <div class="mt-4 grid gap-4 lg:grid-cols-3">
    <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5" style="--rise-i:5">
      <h2 class="card-head type-label text-text-low">
          <NavIcon name="flame" size={12} />
          sequência da semana
        </h2>
      <p class="mt-2 text-[22px] font-semibold text-text-hi tabular-nums">
        {dash.streakDays} <span class="text-[12px] font-medium text-text-soft">{dash.streakDays === 1 ? 'dia' : 'dias'}</span>
      </p>
      {#if dash.dayStrip.length > 0}
        <div data-testid="day-strip" class="mt-3 flex justify-between gap-1">
          {#each dash.dayStrip as cell (cell.dayNum)}
            <span class="text-center">
              <span class="block text-[9.5px] tracking-[.06em] uppercase {cell.state === 'today' ? 'text-accent' : 'text-text-low'}">{cell.label}</span>
              <span
                class="day-pill mt-1.5 {cell.state === 'today'
                  ? 'day-today'
                  : cell.state === 'done'
                    ? 'day-done'
                    : ''}"
              >
                {#if cell.state === 'done'}✓{:else}{cell.dayNum}{/if}
              </span>
            </span>
          {/each}
        </div>
      {/if}
      <p class="type-meta mt-3 border-t border-hairline pt-2.5 text-text-low tabular-nums">
        maior: {dash.longestStreak} {dash.longestStreak === 1 ? 'dia' : 'dias'}
      </p>
    </div>

    <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5" style="--rise-i:6">
      <h2 class="card-head type-label text-text-low">
          <NavIcon name="check" size={12} />
          revisões em dia
        </h2>
      <div class="mt-3 flex items-center gap-5">
        <Ring
          pct={dash.ringPct}
          label={`${dash.ringPct}%`}
          sublabel="da fila"
          size={108}
          ariaLabel={`${dash.ringPct}% da fila de hoje revisada`}
        />
        <div class="min-w-0">
          <p class="text-[12px] text-text-mid tabular-nums">
            {dash.reviewedToday} de {dash.reviewedToday + dash.dueCount} cards
          </p>
          {#if dash.retentionPct !== null}
            <p class="mt-0.5 text-[11px] text-text-low tabular-nums">retenção {dash.retentionPct}%</p>
          {/if}
          {#if dash.dueCount > 0}
            <a
              href="/review"
              class="mt-2.5 inline-block rounded-base bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
            >
              revisar agora
            </a>
          {/if}
        </div>
      </div>
    </div>

    <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5" style="--rise-i:7">
      <div class="card-head justify-between gap-3">
        <h2 class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name="route" size={12} />
          trilhas em andamento
        </h2>
        <a href="/tracks" class="type-meta text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid">→</a>
      </div>
      {#if dash.tracks.length === 0}
        <p class="type-item mt-3 text-text-soft">
          nenhuma trilha ainda — <a class="text-text-mid underline decoration-hairline underline-offset-2 hover:decoration-current" href="/tracks">crie a primeira</a>.
        </p>
      {:else}
        <ul>
          {#each dash.tracks.slice(0, 3) as track (track.id)}
            <li class="border-t border-hairline py-2.5 first:mt-1.5 first:border-t-0">
              <a href={`/tracks/${track.id}`} class="group flex items-center gap-3">
                <span class="mini-ring shrink-0" style="--p:{track.pct}" aria-hidden="true">
                  <span></span>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-body text-[14px] font-medium text-text-body group-hover:text-text-hi">
                    {track.title}
                  </span>
                  <span class="text-[11px] text-text-low tabular-nums">{track.done} / {track.total} tópicos</span>
                </span>
                <span class="shrink-0 text-[12px] font-semibold text-text-mid tabular-nums">{track.pct}%</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- row 4 · charts (merged from the old stats page) -->
  <div class="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
    <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:8">
      <h2 class="card-head type-label text-text-low">
        <NavIcon name="chart" size={12} />
        horas líquidas · últimos 28 dias
      </h2>
      <div class="mt-3">
        <TrendChart points={stats.data.trend28} ariaLabel="minutos líquidos por dia nos últimos 28 dias" />
      </div>
    </div>
    <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:9">
      <h2 class="card-head type-label text-text-low">
        <NavIcon name="list" size={12} />
        como você estuda
      </h2>
      <div class="mt-3.5">
        <MixBar slices={stats.data.typeMix} ariaLabel="distribuição de tempo por tipo de sessão" />
        {#if stats.data.cardOrigin.created > 0}
          <p
            data-testid="cards-from-content"
            class="type-meta mt-3 border-t border-hairline pt-3 text-text-low tabular-nums"
          >
            {Math.round((stats.data.cardOrigin.fromContent / stats.data.cardOrigin.created) * 100)}%
            dos {stats.data.cardOrigin.created} cards novos (28d) nasceram da leitura
          </p>
        {/if}
      </div>
    </div>
  </div>

  <!-- row 5 · accuracy + attention -->
  <div class="mt-4 grid gap-4 lg:grid-cols-2">
    <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:10">
      <h2 class="card-head type-label text-text-low">
        <NavIcon name="check" size={12} />
        acerto por trilha
      </h2>
      <ul data-testid="stats-accuracy">
        {#each stats.data.accuracy as row (row.key)}
          <li data-testid="stats-accuracy-row" class="border-t border-hairline py-2.5 first:mt-2 first:border-t-0">
            <p class="type-item text-text-body">{row.label}</p>
            {#if row.pct !== null}
              <div class="mt-1.5 h-1 rounded-[2px] bg-hairline">
                <span class="grow-x block h-1 rounded-[2px] bg-success" style="width:{row.pct}%"></span>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if stats.data.accuracy.length === 0}
        <p class="type-meta mt-3 text-text-soft">sem questões registradas ainda.</p>
      {/if}
    </div>
    <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5 lg:px-5" style="--rise-i:11">
      <h2 class="card-head type-label text-text-low">
        <NavIcon name="target" size={12} />
        pontos de atenção
      </h2>
      <ul data-testid="stats-weak">
        {#each stats.data.weak as row (row.key)}
          <li data-testid="stats-weak-row" class="border-t border-hairline py-2.5 first:mt-2 first:border-t-0">
            <p class="type-item text-text-body">{row.label}</p>
            {#if row.pct !== null}
              <div class="mt-1.5 h-1 rounded-[2px] bg-hairline">
                <span class="grow-x block h-1 rounded-[2px] bg-accent" style="width:{row.pct}%"></span>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if stats.data.weak.length === 0}
        <p class="type-meta mt-3 text-text-soft">ainda sem dados suficientes.</p>
      {/if}
    </div>
  </div>

  <!-- row 6 · queue + goals -->
  <div class="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_1fr]">
    <div class="rise card rounded-panel border border-hairline bg-surface" style="--rise-i:8">
      <div class="flex items-baseline justify-between gap-3 border-b border-hairline px-4 pt-3.5 pb-3 lg:px-5">
        <h2 class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name="list" size={12} />
          fila de hoje
        </h2>
        {#if today.replanNote}
          <p data-testid="replan-note" class="type-meta text-text-soft">
            ontem ficou pendente — redistribuído · nada acumulado
          </p>
        {/if}
      </div>

      {#if today.items.length === 0}
        <div class="m-4 rounded-base border border-hairline px-4 py-6 text-center lg:m-5">
          <p data-testid="today-empty" class="type-item text-text-soft">
            fila zerada. descanse a memória — ela consolida dormindo.
          </p>
        </div>
      {:else}
        <ul data-testid="today-queue" class="mt-2">
          <!-- sort is unique per item; titles can repeat (e.g. same card front) -->
          {#each today.items as item, i (item.sort)}
            <li
              data-testid="today-item"
              data-kind={item.kind}
              transition:fly={{ y: 6, duration: 180 }}
              class="flex items-center gap-3 border-t border-hairline border-l-[3px] px-4 py-3 lg:px-5 {i ===
              0
                ? 'border-l-accent bg-(--accent-tint-09)'
                : 'border-l-transparent'}"
            >
              <span class={kindDotClass(item)} aria-hidden="true"></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-body text-[14.5px] font-medium text-text-body">
                  {item.title}
                </span>
                {#if item.subtitle !== null}
                  <span class="text-[11px] text-text-low tabular-nums">{item.subtitle}</span>
                {/if}
              </span>
              <a
                href={item.href}
                class="type-meta text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
                aria-label={`abrir ${item.title}`}
              >
                →
              </a>
            </li>
          {/each}
        </ul>
        <div
          class="flex flex-wrap items-center gap-2.5 border-t border-hairline px-4 py-3.5 lg:px-5"
        >
          <a
            data-testid="start-next"
            href={reviewCount > 0 ? '/review' : hasBlocks ? '/study' : '/review'}
            class="rounded-base bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand tabular-nums hover:opacity-90"
          >
            {reviewCount > 0
              ? `começar revisão · ${reviewCount} ${reviewCount === 1 ? 'card' : 'cards'}`
              : 'começar a estudar'}
          </a>
          <a
            href="/study"
            class="rounded-base border border-border px-4 py-2.5 text-[13px] text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            estudar sem fila
          </a>
        </div>
      {/if}

      {#if dash.upNext.length > 0}
        <div class="border-t border-hairline px-4 py-3 lg:px-5">
          <h3 class="type-label text-text-low">a seguir</h3>
          <ul class="mt-1.5 flex flex-col gap-1">
            {#each dash.upNext as row, i (i)}
              <li class="flex items-baseline justify-between gap-3">
                <span class="min-w-0 truncate font-body text-[13px] font-medium text-text-body">{row.title}</span>
                <span class="shrink-0 text-[10.5px] text-text-low tabular-nums">{row.meta}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <div class="flex min-w-0 flex-col gap-4">
      {#if today.targets.length > 0}
        <div class="rise card rounded-panel border border-hairline bg-surface px-4 py-3.5" style="--rise-i:10">
          <h2 class="card-head type-label text-text-low">
          <NavIcon name="target" size={12} />
          metas
        </h2>
          {#each today.targets as target (target.id)}
            <div data-testid="target-progress" class="mt-3 first:mt-2.5">
              <div class="flex justify-between text-[11px] text-text-soft tabular-nums">
                <span>{target.label}</span>
                <span>{target.pct}%</span>
              </div>
              <div class="mt-1.5 h-1 rounded-[2px] bg-hairline">
                <span class="grow-x block h-1 rounded-[2px] bg-accent" style="width:{Math.min(100, target.pct)}%"></span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div
        class="rise rounded-panel border border-hairline border-l-[3px] border-l-accent bg-surface px-4 py-3.5"
        style="--rise-i:11"
      >
        <h2 class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name="bell" size={12} />
          lembrete calmo
        </h2>
        <p class="mt-1.5 font-body text-[13.5px] leading-relaxed text-text-mid italic">
          {dash.quote}
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  .card {
    transition:
      border-color var(--dur-base) var(--ease-brand),
      transform var(--dur-base) var(--ease-brand);
  }
  @media (prefers-reduced-motion: no-preference) {
    .card:hover {
      border-color: var(--border);
      transform: translateY(-1px);
    }
  }

  .mark-bar {
    display: inline-block;
    width: 3px;
    height: 12px;
    border-radius: 1.5px;
  }

  .barcode {
    display: flex;
    gap: 3px;
    height: 18px;
    align-items: stretch;
  }
  .barcode span {
    flex: 1;
    background: var(--accent);
    border-radius: 1px;
    transform-origin: bottom;
  }
  @media (prefers-reduced-motion: no-preference) {
    .barcode span {
      animation: bar-grow 0.5s var(--ease-brand) both;
    }
    .grow-x {
      animation: grow-x 0.7s var(--ease-brand) both;
      transform-origin: left;
    }
  }
  @keyframes bar-grow {
    from {
      transform: scaleY(0);
    }
  }
  @keyframes grow-x {
    from {
      transform: scaleX(0);
    }
  }

  .year-months {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    column-gap: 3px;
    margin-bottom: 4px;
  }
  .year-months span {
    font: 400 9px var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-low);
    grid-row: 1;
    white-space: nowrap;
  }
  .year-months {
    overflow: hidden;
  }
  .year-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(7, auto);
    grid-auto-columns: minmax(0, 1fr);
    gap: 3px;
    width: 100%;
  }
  .year-cell {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 3px;
  }
  .year-empty {
    border: 1px solid var(--hairline);
  }

  .day-pill {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid var(--hairline);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-mid);
  }
  .day-done {
    border-color: var(--success);
    color: var(--success);
  }
  .day-today {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }

  .mini-ring {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: conic-gradient(var(--accent) calc(var(--p) * 1%), var(--hairline) 0);
  }
  .mini-ring span {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface);
  }

  .qdot {
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
  }
  .qdot-review {
    border: 2px solid var(--accent);
  }
  .qdot-block {
    border-radius: 2.5px;
    border: 2px solid var(--text-low);
  }
  .qdot-reminder {
    border: 2px solid var(--text-low);
  }


  @property --pct {
    syntax: '<number>';
    initial-value: 0;
    inherits: false;
  }
  @property --p {
    syntax: '<number>';
    initial-value: 0;
    inherits: false;
  }
  @media (prefers-reduced-motion: no-preference) {
    .mini-ring {
      animation: mini-ring-in 0.9s var(--ease-brand) both;
    }
  }
  @keyframes mini-ring-in {
    from {
      --p: 0;
    }
  }
</style>
