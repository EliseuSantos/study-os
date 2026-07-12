<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    Calendar,
    DayGrid,
    Interaction,
    TimeGrid,
    type EcDateClickArg,
    type EcEventClickArg,
    type EcEventContentArg,
  } from '@event-calendar/core';
  import '@event-calendar/core/index.css';
  import { parseRrule } from '@studyos/core';
  import { dueByDay } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import type { RoutineRow } from '@studyos/shared';
  import { createRemindersStore } from '$lib/stores/reminders.svelte';
  import { createRoutinesStore } from '$lib/stores/routines.svelte';
  import DateTimeField from '$lib/components/DateTimeField.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import SelectSearch from '$lib/components/SelectSearch.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  const DAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const store = createRoutinesStore();

  // review-load forecast: due count per day of the visible week
  let forecast = $state<number[]>([]);
  $effect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = today.getTime() - today.getDay() * 86_400_000;
    void getDb()
      .then((db) => dueByDay(db, weekStart, 7))
      .then((counts) => (forecast = counts))
      .catch(() => {});
  });
  const reminders = createRemindersStore();
  onDestroy(() => {
    store.destroy();
    reminders.destroy();
  });

  let title = $state('');
  const selectedDays = new SvelteSet<number>();
  let startTime = $state('09:00');
  let durationMin = $state(60);
  let trackId = $state('');
  let modalOpen = $state(false);
  let reminderModalOpen = $state(false);

  // detail modal: click an event to view/edit/delete it
  type Detail =
    | { kind: 'routine'; id: string }
    | { kind: 'reminder'; id: string }
    | null;
  let detail = $state<Detail>(null);
  let editTitle = $state('');
  let editAt = $state<number | null>(null);
  const editDays = new SvelteSet<number>();
  let editStart = $state('09:00');
  let editDuration = $state(60);
  let editTrackId = $state('');
  let reminderTitle = $state('');
  let reminderAt = $state<number | null>(null);
  function openModal() {
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    reminderModalOpen = false;
    detail = null;
  }

  function openRoutineDetail(routine: RoutineRow) {
    editTitle = routine.title;
    editDays.clear();
    try {
      for (const day of parseRrule(routine.rrule)) editDays.add(day);
    } catch {
      // outside the supported subset — leave empty
    }
    editStart = routine.start_time;
    editDuration = routine.duration_min;
    editTrackId = routine.track_id ?? '';
    detail = { kind: 'routine', id: routine.id };
  }

  function openReminderDetail(reminder: { id: string; title: string; notify_at: number }) {
    editTitle = reminder.title;
    editAt = reminder.notify_at;
    detail = { kind: 'reminder', id: reminder.id };
  }

  function toggleEditDay(day: number) {
    if (editDays.has(day)) editDays.delete(day);
    else editDays.add(day);
  }

  function onDetailSave(event: SubmitEvent) {
    event.preventDefault();
    if (detail === null) return;
    if (detail.kind === 'reminder') {
      if (editAt === null || !editTitle.trim()) return;
      void reminders.update(detail.id, editTitle, editAt);
    } else {
      void store.update(detail.id, {
        title: editTitle,
        track_id: editTrackId === '' ? null : editTrackId,
        days: [...editDays],
        start_time: editStart,
        duration_min: editDuration,
      });
    }
    closeModal();
  }

  function onDetailDelete() {
    if (detail === null) return;
    if (detail.kind === 'reminder') void reminders.remove(detail.id);
    else void store.remove(detail.id);
    closeModal();
  }

  function onModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeModal();
  }

  const REMINDER_PRESETS: { label: string; at: () => number }[] = [
    { label: 'hoje 20:00', at: () => new Date().setHours(20, 0, 0, 0) },
    { label: 'amanhã 08:00', at: () => new Date().setHours(8, 0, 0, 0) + 86_400_000 },
    { label: 'em 1 semana', at: () => new Date().setHours(9, 0, 0, 0) + 7 * 86_400_000 },
  ];

  const nextReminder = $derived(
    [...reminders.reminders]
      .sort((a, b) => a.notify_at - b.notify_at)
      .find((r) => r.notify_at >= Date.now()) ?? null,
  );

  function onReminderSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (reminderAt === null || !reminderTitle.trim()) return;
    const value = reminderTitle;
    const at = reminderAt;
    reminderTitle = '';
    reminderAt = null;
    void reminders.add(value, at);
    closeModal();
    showToast('lembrete criado', 'success');
  }

  const trackTitleById = $derived(new Map(store.tracks.map((t) => [t.id, t.title])));
  const trackOptions = $derived([
    { value: '', label: 'estudo livre' },
    ...store.tracks.map((t) => ({ value: t.id, label: t.title })),
  ]);

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

  const weekBlocks = $derived(columns.reduce((n, day) => n + day.length, 0));
  const weekMin = $derived(
    columns.reduce((n, day) => n + day.reduce((m, r) => m + r.duration_min, 0), 0),
  );

  function esc(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Recurring weekly routines materialized over ±6 weeks so prev/next and the
  // month view keep showing them while navigating.
  const calEvents = $derived.by(() => {
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const events: Record<string, unknown>[] = [];
    for (let week = -6; week <= 6; week += 1) {
      columns.forEach((dayRoutines, day) => {
        for (const routine of dayRoutines) {
          const [h, m] = routine.start_time.split(':');
          const start = new Date(weekStart);
          start.setDate(start.getDate() + week * 7 + day);
          start.setHours(Number(h ?? 9), Number(m ?? 0), 0, 0);
          events.push({
            id: `${routine.id}:${week}:${day}`,
            start,
            end: new Date(start.getTime() + routine.duration_min * 60_000),
            title: routine.title,
            extendedProps: {
              routineId: routine.id,
              track:
                routine.track_id !== null ? (trackTitleById.get(routine.track_id) ?? null) : null,
            },
          });
        }
      });
    }
    // one-off reminders land on the calendar as short marked events
    for (const reminder of reminders.reminders) {
      const start = new Date(reminder.notify_at);
      events.push({
        id: `reminder:${reminder.id}`,
        start,
        end: new Date(start.getTime() + 30 * 60_000),
        title: reminder.title,
        extendedProps: { kind: 'reminder', reminderId: reminder.id },
      });
    }
    // review-load forecast: an all-day marker per day of the current week
    forecast.forEach((count, day) => {
      if (count === 0) return;
      const start = new Date(weekStart);
      start.setDate(start.getDate() + day);
      events.push({
        id: `forecast:${day}`,
        start,
        end: new Date(start.getTime() + 86_400_000),
        allDay: true,
        title: `≈ ${count} ${count === 1 ? 'revisão' : 'revisões'}`,
        extendedProps: { kind: 'forecast' },
      });
    });
    return events;
  });

  const slotRange = $derived.by(() => {
    let min = 8;
    let max = 20;
    for (const event of calEvents) {
      const start = event['start'] as Date;
      const end = event['end'] as Date;
      min = Math.min(min, start.getHours());
      max = Math.max(max, end.getHours() + (end.getMinutes() > 0 ? 1 : 0));
    }
    const pad = (n: number) => `${String(n).padStart(2, '0')}:00:00`;
    return { min: pad(Math.max(0, min - 1)), max: pad(Math.min(24, max + 1)) };
  });

  const calOptions = $state<Record<string, unknown>>({
    view: 'timeGridWeek',
    headerToolbar: {
      start: 'title',
      center: '',
      end: 'today prev,next dayGridMonth,timeGridWeek,timeGridDay',
    },
    buttonText: {
      today: 'hoje',
      dayGridMonth: 'mês',
      timeGridWeek: 'semana',
      timeGridDay: 'dia',
    },
    allDaySlot: true,
    firstDay: 0,
    locale: 'pt-BR',
    nowIndicator: true,
    slotHeight: 22,
    dayHeaderFormat: { weekday: 'short' },
    eventTimeFormat: { hour: '2-digit', minute: '2-digit' },
    dateClick: (info: EcDateClickArg) => {
      // clicking a slot pre-fills the new-routine modal with that day and time
      const d = info.date;
      startTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      selectedDays.clear();
      selectedDays.add(d.getDay());
      openModal();
    },
    eventContent: (info: EcEventContentArg) => {
      if (info.event.extendedProps['kind'] === 'forecast') {
        return {
          html: `<div class="rb rb-forecast" data-testid="forecast-day">${esc(info.event.title)}</div>`,
        };
      }
      // blocks under ~45min are too short for stacked lines — render one line
      const ms =
        info.event.end !== null && info.event.start !== null
          ? info.event.end.getTime() - info.event.start.getTime()
          : 0;
      const compact = ms > 0 && ms <= 45 * 60_000 ? ' rb-compact' : '';
      if (info.event.extendedProps['kind'] === 'reminder') {
        return {
          html:
            `<div class="rb rb-reminder${compact}" data-testid="reminder-item">` +
            `<span class="rb-title">◆ ${esc(info.event.title)}</span>` +
            `<span class="rb-time">${info.timeText}</span>` +
            `</div>`,
        };
      }
      const track = info.event.extendedProps['track'];
      return {
        html:
          `<div class="rb${compact}" data-testid="routine-block">` +
          `<span class="rb-title">${esc(info.event.title)}</span>` +
          `<span class="rb-time">${info.timeText}</span>` +
          (typeof track === 'string' && compact === ''
            ? `<span class="rb-track">${esc(track)}</span>`
            : '') +
          `</div>`,
      };
    },
    eventClick: (info: EcEventClickArg) => {
      if (info.event.extendedProps['kind'] === 'forecast') return;
      const reminderId = info.event.extendedProps['reminderId'];
      if (typeof reminderId === 'string') {
        const reminder = reminders.reminders.find((r) => r.id === reminderId);
        if (reminder) openReminderDetail(reminder);
        return;
      }
      const routineId = info.event.extendedProps['routineId'];
      if (typeof routineId === 'string') {
        const routine = store.routines.find((r) => r.id === routineId);
        if (routine) openRoutineDetail(routine);
      }
    },
    events: [],
  });

  $effect(() => {
    calOptions['events'] = calEvents;
    calOptions['slotMinTime'] = slotRange.min;
    calOptions['slotMaxTime'] = slotRange.max;
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
    closeModal();
    showToast('rotina criada', 'success');
  }
</script>

<svelte:head>
  <title>StudyOS — rotinas</title>
</svelte:head>

<svelte:window onkeydown={modalOpen || reminderModalOpen || detail !== null ? onModalKeydown : undefined} />

<div class="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-7">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <header>
      <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">agenda</h1>
      <p class="type-meta mt-1 text-text-low tabular-nums">
        {weekBlocks === 0
          ? 'monte sua semana de estudo'
          : `${weekBlocks} ${weekBlocks === 1 ? 'bloco' : 'blocos'} na semana · ${formatDuration(weekMin)} planejadas`}{nextReminder !==
        null
          ? ` · próximo lembrete: ${nextReminder.title}`
          : ''}
      </p>
    </header>
    <div class="flex flex-wrap gap-2">
      <button
        data-testid="reminder-open-modal"
        type="button"
        onclick={() => (reminderModalOpen = true)}
        class="flex cursor-pointer items-center gap-2 rounded-base border border-border px-4 py-2.5 text-[13px] font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        <NavIcon name="bell" size={14} />
        lembrete
      </button>
      <button
        data-testid="routine-open-modal"
        type="button"
        onclick={openModal}
        class="flex cursor-pointer items-center gap-2 rounded-base bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        <NavIcon name="plus" size={14} />
        nova rotina
      </button>
    </div>
  </div>

  <!-- full-width week calendar -->
  <div class="mt-5 rounded-panel border border-hairline bg-surface px-4 py-4 lg:px-5">
    <h2 class="flex items-center gap-1.5 type-label text-text-low">
      <NavIcon name="calendar" size={12} />
      semana
    </h2>
    <div data-testid="routine-grid" class="cal mt-3">
      <Calendar plugins={[TimeGrid, DayGrid, Interaction]} options={calOptions} />
    </div>
    {#if store.routines.length === 0}
      <p class="type-item mt-3 text-text-soft">
        nenhuma rotina ainda — use o botão “nova rotina” para criar a primeira.
      </p>
    {/if}
  </div>

</div>

{#if detail !== null}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeModal();
    }}
  >
    <div
      data-testid={detail.kind === 'reminder' ? 'reminder-detail' : 'routine-detail'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 id="detail-modal-title" class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name={detail.kind === 'reminder' ? 'bell' : 'calendar'} size={12} />
          {detail.kind === 'reminder' ? 'lembrete' : 'rotina'}
        </h2>
        <button type="button" aria-label="fechar" title="fechar" onclick={closeModal} class="icon-btn">
          <NavIcon name="x" size={13} />
        </button>
      </div>

      <form class="mt-3" onsubmit={onDetailSave}>
        <label class="sr-only" for="detail-title">título</label>
        <input
          id="detail-title"
          data-testid="detail-title-input"
          type="text"
          bind:value={editTitle}
          autocomplete="off"
          class="type-item h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body"
        />

        {#if detail.kind === 'reminder'}
          <div class="mt-3">
            <DateTimeField bind:value={editAt} ariaLabel="data e hora do lembrete" />
          </div>
        {:else}
          <p class="type-label mt-4 text-text-low" id="detail-days-label">dias da semana</p>
          <div
            role="group"
            aria-labelledby="detail-days-label"
            class="mt-2 flex flex-wrap gap-1.5"
          >
            {#each DAY_LABELS as label, day (day)}
              <button
                type="button"
                aria-pressed={editDays.has(day)}
                onclick={() => toggleEditDay(day)}
                class="type-meta h-(--h-button-md) cursor-pointer rounded-chip border px-2.5 transition-colors duration-(--dur-base) ease-brand {editDays.has(
                  day,
                )
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-border text-text-mid hover:text-text-hi'}"
              >
                {label}
              </button>
            {/each}
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label class="type-label block text-text-low" for="detail-start">início</label>
              <input
                id="detail-start"
                type="time"
                bind:value={editStart}
                class="type-item mt-2 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body"
              />
            </div>
            <div>
              <label class="type-label block text-text-low" for="detail-duration">minutos</label>
              <input
                id="detail-duration"
                type="number"
                min="5"
                step="5"
                bind:value={editDuration}
                class="type-item mt-2 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body"
              />
            </div>
          </div>

          <p class="type-label mt-4 block text-text-low">trilha</p>
          <div class="mt-2">
            <SelectSearch
              options={trackOptions}
              bind:value={editTrackId}
              ariaLabel="trilha da rotina"
              placeholder="estudo livre"
            />
          </div>
        {/if}

        <div class="mt-4 flex items-center gap-2">
          <button
            data-testid="detail-save"
            type="submit"
            class="flex h-(--h-button-md) flex-1 cursor-pointer items-center justify-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
          >
            <NavIcon name="check" size={14} />
            salvar
          </button>
          <button
            data-testid={detail.kind === 'reminder' ? 'reminder-delete' : 'routine-delete'}
            type="button"
            onclick={onDetailDelete}
            class="flex h-(--h-button-md) cursor-pointer items-center gap-2 rounded-base border border-border px-4 font-semibold text-text-mid transition-colors duration-(--dur-base) ease-brand hover:border-text-low hover:text-text-hi"
          >
            <NavIcon name="trash" size={13} />
            excluir
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if reminderModalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeModal();
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-modal-title"
      class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 id="reminder-modal-title" class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name="bell" size={12} />
          novo lembrete
        </h2>
        <button type="button" aria-label="fechar" title="fechar" onclick={closeModal} class="icon-btn">
          <NavIcon name="x" size={13} />
        </button>
      </div>
      <form data-testid="reminder-form" class="mt-3" onsubmit={onReminderSubmit}>
        <label class="sr-only" for="reminder-title">título do lembrete</label>
        <input
          id="reminder-title"
          data-testid="reminder-title-input"
          type="text"
          bind:value={reminderTitle}
          placeholder="ex.: revisar constitucional"
          autocomplete="off"
          class="type-item h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
        />
        <div class="mt-3">
          <DateTimeField
            bind:value={reminderAt}
            testid="reminder-datetime-input"
            ariaLabel="data e hora do lembrete"
          />
        </div>
        <div class="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="atalhos de data">
          {#each REMINDER_PRESETS as preset (preset.label)}
            <button
              type="button"
              onclick={() => (reminderAt = preset.at())}
              class="type-meta cursor-pointer rounded-chip border border-border px-2.5 py-1 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:border-text-low hover:text-text-hi"
            >
              {preset.label}
            </button>
          {/each}
        </div>
        <button
          data-testid="reminder-submit"
          type="submit"
          disabled={reminderAt === null || reminderTitle.trim() === ''}
          class="mt-3 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <NavIcon name="plus" size={14} />
          criar lembrete
        </button>
      </form>
    </div>
  </div>
{/if}

{#if modalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeModal();
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="routine-modal-title"
      class="modal-panel rounded-panel border border-border bg-bg-deep px-5 py-5"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 id="routine-modal-title" class="flex items-center gap-1.5 type-label text-text-low">
          <NavIcon name="plus" size={12} />
          nova rotina
        </h2>
        <button
          type="button"
          aria-label="fechar"
          title="fechar"
          onclick={closeModal}
          class="icon-btn"
        >
          <NavIcon name="x" size={13} />
        </button>
      </div>
          <form data-testid="routine-form" class="mt-3" {onsubmit}>
            <label class="sr-only" for="routine-title">título da rotina</label>
            <input
              id="routine-title"
              data-testid="routine-title-input"
              type="text"
              bind:value={title}
              placeholder="ex.: revisão de constitucional"
              autocomplete="off"
              class="type-item h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
            />

            <p class="type-label mt-4 text-text-low" id="routine-days-label">dias da semana</p>
            <div
              data-testid="routine-days"
              role="group"
              aria-labelledby="routine-days-label"
              class="mt-2 flex flex-wrap gap-1.5"
            >
              {#each DAY_LABELS as label, day (day)}
                <button
                  data-testid={`routine-day-${day}`}
                  type="button"
                  aria-pressed={selectedDays.has(day)}
                  onclick={() => toggleDay(day)}
                  class="type-meta h-(--h-button-md) cursor-pointer rounded-chip border px-2.5 transition-colors duration-(--dur-base) ease-brand {selectedDays.has(
                    day,
                  )
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-border text-text-mid hover:text-text-hi'}"
                >
                  {label}
                </button>
              {/each}
            </div>

            <div class="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label class="type-label block text-text-low" for="routine-start">início</label>
                <input
                  id="routine-start"
                  data-testid="routine-start-input"
                  type="time"
                  bind:value={startTime}
                  class="type-item mt-2 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body"
                />
              </div>
              <div>
                <label class="type-label block text-text-low" for="routine-duration">minutos</label>
                <input
                  id="routine-duration"
                  data-testid="routine-duration-input"
                  type="number"
                  min="5"
                  step="5"
                  bind:value={durationMin}
                  class="type-item mt-2 h-(--h-button-md) w-full rounded-base border border-border bg-surface px-3 text-text-body"
                />
              </div>
            </div>

            <p class="type-label mt-4 block text-text-low">trilha</p>
            <div class="mt-2">
              <SelectSearch
                options={trackOptions}
                bind:value={trackId}
                testid="routine-track-select"
                ariaLabel="trilha da rotina"
                placeholder="estudo livre"
              />
            </div>

            <button
              data-testid="routine-submit"
              type="submit"
              class="mt-4 flex h-(--h-button-md) w-full cursor-pointer items-center justify-center gap-2 rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
            >
              <NavIcon name="plus" size={14} />
              criar rotina
            </button>
          </form>
    </div>
  </div>
{/if}

<style>

  /* @event-calendar themed to the brand tokens */
  .cal :global(.ec) {
    --ec-bg-color: transparent;
    --ec-border-color: var(--hairline);
    --ec-text-color: var(--text-mid);
    --ec-event-bg-color: var(--accent-tint-12);
    --ec-event-text-color: var(--text-hi);
    --ec-today-bg-color: var(--accent-tint-09);
    --ec-now-indicator-color: var(--accent);
    --ec-button-bg-color: transparent;
    --ec-button-border-color: var(--border);
    --ec-button-text-color: var(--text-mid);
    --ec-button-active-bg-color: var(--accent);
    --ec-button-active-border-color: var(--accent);
    --ec-button-active-text-color: var(--accent-ink);
    --ec-slot-height: 22px;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .cal :global(.ec-title) {
    font: 600 14px var(--font-display);
    color: var(--text-hi);
    text-transform: lowercase;
  }
  .cal :global(.ec-toolbar button) {
    cursor: pointer;
    font: var(--type-meta);
    border-radius: var(--radius-base);
  }
  .cal :global(.ec-day.ec-highlight) {
    background: var(--accent-tint-09);
  }
  .cal :global(.ec-day-head) {
    color: var(--text-low);
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .cal :global(.ec-event) {
    border-radius: var(--radius-base);
    border-left: 3px solid var(--accent);
    padding: 3px 6px;
    box-shadow: none;
    overflow: hidden;
    cursor: pointer;
    transition: filter var(--dur-base) var(--ease);
  }
  .cal :global(.ec-event:hover) {
    filter: brightness(1.15);
  }
  .cal :global(.rb) {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  /* short blocks: everything on one baseline-aligned line */
  .cal :global(.rb-compact) {
    flex-direction: row;
    align-items: baseline;
    gap: 6px;
  }
  .cal :global(.ec-event:has(.rb-compact)) {
    padding-block: 2px;
  }
  .cal :global(.rb-compact .rb-title) {
    line-height: 1.15;
    flex: 0 1 auto;
  }
  .cal :global(.rb-compact .rb-time) {
    flex-shrink: 0;
  }
  .cal :global(.rb-title) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 11.5px;
    color: var(--text-hi);
  }
  .cal :global(.rb-time) {
    font-size: 10px;
    color: var(--text-mid);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cal :global(.ec-event:has(.rb-forecast)) {
    border-left: none;
    background: transparent;
    padding: 0 6px;
    cursor: default;
  }
  .cal :global(.rb-forecast) {
    font-size: 10px;
    color: var(--text-low);
    font-variant-numeric: tabular-nums;
  }
  .cal :global(.ec-event:has(.rb-reminder)) {
    border-left-color: var(--success);
    background: transparent;
    border: 1px dashed var(--border);
    border-left: 3px solid var(--success);
  }
  .cal :global(.rb-track) {
    font-size: 10px;
    color: var(--text-low);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
