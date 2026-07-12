<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getSetting, listRoutines, setSettingStmt } from '@studyos/db';
  import { getDb } from '$lib/db/client';
  import { buildIcs } from '$lib/push/ics';
  import { maybeNotifyDue } from '$lib/push/local';
  import { enablePush } from '$lib/push/subscribe';
  import { createProfileStore } from '$lib/stores/profile.svelte';
  import { dbState } from '$lib/stores/db-state.svelte';
  import { requestSync, syncState } from '$lib/sync/index.svelte';
  import { installState, promptInstall } from '$lib/pwa/install.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  const profile = createProfileStore();
  const writable = $derived(dbState.status === 'ready');

  let name = $state('');
  let nameLoaded = $state(false);
  let nameSaved = $state(false);
  let syncToken = $state('');
  let theme = $state<'dark' | 'light'>('dark');
  let permission = $state<NotificationPermission | 'unsupported'>('default');
  let pushStatus = $state<'idle' | 'busy' | 'active' | 'error'>('idle');
  let isIos = $state(false);
  let isStandalone = $state(true);

  onMount(() => {
    theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    void getDb()
      .then(async (db) => {
        name = (await getSetting(db, 'profile_name')) ?? '';
        nameLoaded = true;
      })
      .catch(() => {
        nameLoaded = true;
      });
  });

  onDestroy(() => profile.destroy());

  function onNameSubmit(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    void (async () => {
      const db = await getDb();
      // batch (not exec) so the tables-changed broadcast refreshes the profile store
      await db.batch([setSettingStmt('profile_name', trimmed)]);
      nameSaved = true;
      showToast('nome salvo', 'success');
      setTimeout(() => (nameSaved = false), 2500);
    })();
  }

  function setTheme(next: 'dark' | 'light') {
    theme = next;
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      );
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

  const syncLabel = $derived.by(() => {
    switch (syncState.status) {
      case 'syncing':
        return 'sincronizando…';
      case 'error':
        return 'não sincronizou — tenta de novo sozinho';
      case 'offline':
        return 'offline · sincroniza quando voltar';
      case 'disabled':
        return 'local apenas · sync não configurado';
      default:
        return syncState.lastSyncAt === null
          ? 'local primeiro · sincroniza quando online'
          : `sincronizado · ${new Date(syncState.lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  });

  async function saveSyncToken(): Promise<void> {
    const value = syncToken.trim();
    if (value === '') return;
    const db = await getDb();
    await db.batch([setSettingStmt('sync_token', value)]);
    showToast('token salvo — sincronizando', 'success');
    void requestSync();
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
    const routineRows = await listRoutines(db);
    const text = buildIcs(routineRows, Date.now());
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
  <title>StudyOS — ajustes</title>
</svelte:head>

<div class="mx-auto w-full max-w-[760px] px-4 py-6 lg:px-8 lg:py-7">
  <header class="rise" style="--rise-i:0">
    <h1 class="text-[25px] font-semibold tracking-tight text-text-hi">ajustes</h1>
    <p class="type-meta mt-1 text-text-low">perfil, notificações e aparência — tudo num lugar</p>
  </header>

  <!-- perfil -->
  <section class="rise mt-5 rounded-panel border border-hairline bg-surface" style="--rise-i:1">
    <h2 class="flex items-center gap-1.5 px-5 pt-4 pb-3 type-label text-text-low">
      <NavIcon name="home" size={12} />
      perfil
    </h2>
    <div class="setting-row border-t border-hairline">
      <div>
        <p class="setting-title">seu nome</p>
        <p class="setting-desc">aparece na saudação do hoje e na barra lateral.</p>
      </div>
      <form data-testid="profile-form" class="flex w-full gap-2 sm:w-auto" onsubmit={onNameSubmit}>
        <label class="sr-only" for="profile-name">seu nome</label>
        <input
          id="profile-name"
          data-testid="profile-name-input"
          type="text"
          bind:value={name}
          placeholder={nameLoaded ? 'como quer ser chamado?' : 'carregando…'}
          autocomplete="off"
          disabled={!writable}
          class="type-item h-(--h-button-md) w-full min-w-0 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low disabled:opacity-50 sm:w-52"
        />
        <button
          data-testid="profile-name-save"
          type="submit"
          disabled={!writable || name.trim() === ''}
          class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {nameSaved ? '✓ salvo' : 'salvar'}
        </button>
      </form>
    </div>
  </section>

  <!-- aparência -->
  <section class="rise mt-4 rounded-panel border border-hairline bg-surface" style="--rise-i:2">
    <h2 class="flex items-center gap-1.5 px-5 pt-4 pb-3 type-label text-text-low">
      <NavIcon name="sun" size={12} />
      aparência
    </h2>
    <div class="setting-row border-t border-hairline">
      <div>
        <p class="setting-title">tema</p>
        <p class="setting-desc">escuro é o padrão da casa; claro para ambientes luminosos.</p>
      </div>
      <div
        role="group"
        aria-label="tema"
        class="inline-flex shrink-0 overflow-hidden rounded-base border border-border"
      >
        <button
          type="button"
          aria-pressed={theme === 'dark'}
          onclick={() => setTheme('dark')}
          class="flex cursor-pointer items-center gap-2 px-4 py-2 text-[12.5px] font-semibold transition-colors duration-(--dur-base) ease-brand {theme ===
          'dark'
            ? 'bg-surface-2 text-text-hi'
            : 'text-text-mid hover:text-text-hi'}"
        >
          <NavIcon name="moon" size={13} />
          escuro
        </button>
        <button
          type="button"
          aria-pressed={theme === 'light'}
          onclick={() => setTheme('light')}
          class="flex cursor-pointer items-center gap-2 border-l border-hairline px-4 py-2 text-[12.5px] font-semibold transition-colors duration-(--dur-base) ease-brand {theme ===
          'light'
            ? 'bg-surface-2 text-text-hi'
            : 'text-text-mid hover:text-text-hi'}"
        >
          <NavIcon name="sun" size={13} />
          claro
        </button>
      </div>
    </div>
    {#if installState.canInstall}
      <div class="setting-row border-t border-hairline">
        <div>
          <p class="setting-title">aplicativo</p>
          <p class="setting-desc">instale para abrir direto, com ícone e janela próprios.</p>
        </div>
        <button
          data-testid="install-app-settings"
          type="button"
          onclick={() => void promptInstall()}
          class="type-meta shrink-0 cursor-pointer rounded-base border border-border px-3.5 py-2 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          instalar como app
        </button>
      </div>
    {/if}
  </section>

  <!-- notificações -->
  <section class="rise mt-4 rounded-panel border border-hairline bg-surface" style="--rise-i:3">
    <h2 class="flex items-center gap-1.5 px-5 pt-4 pb-3 type-label text-text-low">
      <NavIcon name="bell" size={12} />
      notificações
    </h2>
    <div class="setting-row border-t border-hairline">
      <div>
        <p class="setting-title">alertas de lembretes</p>
        <p class="setting-desc">avisos do navegador quando um lembrete vence com o app aberto.</p>
      </div>
      <button
        data-testid="notifications-enable"
        type="button"
        disabled={permission !== 'default'}
        onclick={() => void enableNotifications()}
        class="type-meta h-(--h-button-sm) shrink-0 cursor-pointer rounded-base border border-border px-3.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-default disabled:opacity-60 disabled:hover:text-text-mid"
      >
        {notifLabel}
      </button>
    </div>
    <div class="setting-row border-t border-hairline">
      <div>
        <p class="setting-title">push</p>
        <p class="setting-desc">
          lembretes chegam mesmo com o app fechado.
          <span aria-live="polite">{pushLabel !== '' ? ` ${pushLabel}` : ''}</span>
        </p>
        {#if isIos && !isStandalone}
          <p data-testid="ios-install-hint" class="setting-desc mt-1">
            no iphone: compartilhar → adicionar à tela de início — necessário para notificações.
          </p>
        {/if}
      </div>
      <button
        data-testid="push-enable"
        type="button"
        onclick={() => void onEnablePush()}
        class="type-meta h-(--h-button-sm) shrink-0 cursor-pointer rounded-base border border-border px-3.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        ativar push
      </button>
    </div>
  </section>

  <!-- sincronização -->
  <section class="rise mt-4 rounded-panel border border-hairline bg-surface" style="--rise-i:4">
    <h2 class="flex items-center gap-1.5 px-5 pt-4 pb-3 type-label text-text-low">
      <NavIcon name="cycle" size={12} />
      sincronização
    </h2>
    <div class="setting-row border-t border-hairline">
      <div class="min-w-0 flex-1">
        <p class="setting-title">token de sincronização</p>
        <p class="setting-desc">
          o mesmo SYNC_TOKEN do seu worker — só é preciso em instalação própria.
        </p>
        <form
          class="mt-2 flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            void saveSyncToken();
          }}
        >
          <input
            data-testid="settings-sync-token"
            type="password"
            bind:value={syncToken}
            placeholder="token do worker"
            autocomplete="off"
            class="type-meta h-8 min-w-0 flex-1 rounded-base border border-border bg-transparent px-3 text-text-body placeholder:text-text-low"
          />
          <button
            data-testid="settings-sync-token-save"
            type="submit"
            class="type-meta h-8 cursor-pointer rounded-base border border-border px-3 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            salvar
          </button>
        </form>
      </div>
    </div>
    <div class="setting-row border-t border-hairline">
      <div>
        <p class="setting-title">seus dados</p>
        <p class="setting-desc" aria-live="polite">{syncLabel}</p>
      </div>
      <button
        data-testid="settings-sync-now"
        type="button"
        onclick={() => void requestSync()}
        class="type-meta h-(--h-button-sm) shrink-0 cursor-pointer rounded-base border border-border px-3.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        sincronizar agora
      </button>
    </div>
    <div class="setting-row border-t border-hairline">
      <div>
        <p class="setting-title">agenda no calendário</p>
        <p class="setting-desc">exporte as rotinas em .ics para o google agenda ou similar.</p>
      </div>
      <button
        data-testid="ics-export"
        type="button"
        onclick={() => void exportIcs()}
        class="type-meta h-(--h-button-sm) shrink-0 cursor-pointer rounded-base border border-border px-3.5 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        exportar .ics
      </button>
    </div>
  </section>
</div>

<style>
  .setting-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 24px;
    padding: 16px 20px;
  }
  .setting-row > div:first-child {
    min-width: 0;
    flex: 1 1 260px;
  }
  .setting-title {
    font: 500 13.5px/1.4 var(--font-display);
    color: var(--text-body);
  }
  .setting-desc {
    margin-top: 2px;
    font: var(--type-meta);
    color: var(--text-low);
  }
</style>
