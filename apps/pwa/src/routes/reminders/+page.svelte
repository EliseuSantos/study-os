<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { listRoutines } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { buildIcs } from '$lib/push/ics';
  import { maybeNotifyDue } from '$lib/push/local';
  import { enablePush } from '$lib/push/subscribe';
  import { createRemindersStore } from '$lib/stores/reminders.svelte';

  const store = createRemindersStore();
  let title = $state('');
  let datetime = $state('');
  let permission = $state<NotificationPermission | 'unsupported'>('default');
  let pushStatus = $state<'idle' | 'busy' | 'active' | 'error'>('idle');

  onMount(() => {
    permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  });

  onDestroy(() => {
    store.destroy();
  });

  const dateFmt = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  /** `qui · 9 jul · 14:00` */
  function reminderDate(ms: number): string {
    const d = new Date(ms);
    const parts = dateFmt.formatToParts(d);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const weekday = part('weekday').replace('.', '');
    const month = part('month').replace('.', '');
    return `${weekday} · ${part('day')} ${month} · ${timeFmt.format(d)}`;
  }

  const notifLabel = $derived.by(() => {
    if (permission === 'granted') return 'notificações ativas';
    if (permission === 'denied') return 'bloqueadas no navegador';
    return 'ativar notificações';
  });

  const pushLabel = $derived.by(() => {
    switch (pushStatus) {
      case 'busy':
        return 'ativando push…';
      case 'active':
        return 'push ativo neste dispositivo';
      case 'error':
        return 'não deu para ativar o push agora.';
      default:
        return '';
    }
  });

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!datetime) return;
    const notifyAt = new Date(datetime).getTime();
    const value = title;
    title = '';
    datetime = '';
    void store.add(value, notifyAt);
  }

  async function enableNotifications() {
    if (permission !== 'default' || typeof Notification === 'undefined') return;
    try {
      permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const db = await getDb();
        await maybeNotifyDue(db);
      }
    } catch {
      // permission prompt unavailable: keep the current state
    }
  }

  async function onEnablePush() {
    if (pushStatus === 'busy') return;
    pushStatus = 'busy';
    try {
      await enablePush();
      pushStatus = 'active';
    } catch {
      pushStatus = 'error';
    }
  }

  async function exportIcs() {
    const db = await getDb();
    const routines = await listRoutines(db);
    const text = buildIcs(routines, Date.now());
    const blob = new Blob([text], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studyos.ics';
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>StudyOS — lembretes</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">lembretes</p>
  <h1 class="type-h1 mt-2 text-text-hi">lembretes</h1>

  <form data-testid="reminder-form" class="mt-8" {onsubmit}>
    <label class="type-label block text-text-low" for="reminder-title">novo lembrete</label>
    <div class="mt-3 flex flex-wrap gap-2">
      <input
        id="reminder-title"
        data-testid="reminder-title-input"
        type="text"
        bind:value={title}
        placeholder="ex.: revisar constitucional"
        autocomplete="off"
        class="type-item h-(--h-button-md) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
      />
      <input
        data-testid="reminder-datetime-input"
        type="datetime-local"
        bind:value={datetime}
        aria-label="data e hora do lembrete"
        class="type-item h-(--h-button-md) shrink-0 rounded-base border border-border bg-surface px-3 text-text-body"
      />
      <button
        data-testid="reminder-submit"
        type="submit"
        class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        criar lembrete
      </button>
    </div>
  </form>

  <ul data-testid="reminder-list" class="mt-8">
    {#each store.reminders as reminder (reminder.id)}
      <li
        data-testid="reminder-item"
        class="flex items-baseline justify-between gap-3 border-b border-hairline py-3 first:border-t"
      >
        <span class="type-item min-w-0 flex-1 text-text-body">{reminder.title}</span>
        <span class="type-meta shrink-0 text-text-low">{reminderDate(reminder.notify_at)}</span>
        <button
          data-testid="reminder-delete"
          type="button"
          aria-label="excluir lembrete {reminder.title}"
          onclick={() => void store.remove(reminder.id)}
          class="type-meta shrink-0 cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          ×
        </button>
      </li>
    {/each}
  </ul>

  {#if store.reminders.length === 0}
    <p class="type-item mt-2 text-text-soft">nenhum lembrete ainda — crie o primeiro.</p>
  {/if}

  <h2 class="type-label mt-12 text-text-low">notificações</h2>
  <div class="mt-4 flex flex-wrap items-center gap-3">
    <button
      data-testid="notifications-enable"
      type="button"
      onclick={() => void enableNotifications()}
      class="type-meta h-(--h-button-sm) cursor-pointer rounded-base border border-border px-4 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      {notifLabel}
    </button>
    <button
      data-testid="push-enable"
      type="button"
      onclick={() => void onEnablePush()}
      class="type-meta h-(--h-button-sm) cursor-pointer rounded-base border border-border px-4 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      ativar push
    </button>
    <button
      data-testid="ics-export"
      type="button"
      onclick={() => void exportIcs()}
      class="type-meta h-(--h-button-sm) cursor-pointer rounded-base border border-border px-4 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      exportar .ics
    </button>
    {#if pushLabel !== ''}
      <span class="type-meta text-text-low" aria-live="polite">{pushLabel}</span>
    {/if}
  </div>
</section>
