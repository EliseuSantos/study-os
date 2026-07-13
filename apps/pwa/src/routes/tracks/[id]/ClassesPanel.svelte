<script lang="ts">
  // Turmas: cada turma nomeia um link/QR próprio (share independente). Apagar
  // uma turma só remove o registro local — o link já distribuído segue válido.
  import { untrack } from 'svelte';
  import { renderSVG } from 'uqr';
  import {
    createClass,
    deleteClass,
    getOrCreateDeviceId,
    listClasses,
    listTopics,
  } from '@studyos/db';
  import type { ClassRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { liveQuery, type LiveQuery } from '$lib/db/live.svelte';
  import { authedFetch } from '$lib/stores/library.svelte';
  import { buildTrackSnapshot, publishSnapshot } from '$lib/stores/share.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';

  let { trackId }: { trackId: string } = $props();

  let live = $state.raw<LiveQuery<ClassRow[]> | null>(null);
  $effect(() => {
    const lq = liveQuery((db) => listClasses(db, trackId), ['classes'], [] as ClassRow[]);
    untrack(() => {
      live?.destroy();
      live = lq;
    });
    return () => lq.destroy();
  });
  const classes = $derived(live?.value ?? []);

  let name = $state('');
  let creating = $state(false);
  let qrFor = $state<string | null>(null);

  // cohort aggregates (k>=3 devices; the worker never returns raw rows)
  interface ClassProgress {
    count: number;
    median_done: number;
    avg_week_minutes: number;
    topics: { sid: string; done_ratio: number }[];
  }
  let progressFor = $state<string | null>(null);
  let progress = $state<ClassProgress | null>(null);
  let progressThin = $state(false);
  let topicTitles = $state<Map<string, string>>(new Map());
  // a slow earlier fetch must not overwrite a newer open (toggle close/reopen)
  let progressSeq = 0;

  async function openProgress(cls: ClassRow): Promise<void> {
    if (progressFor === cls.id) {
      progressFor = null;
      return;
    }
    const seq = ++progressSeq;
    progressFor = cls.id;
    progress = null;
    progressThin = false;
    try {
      const db = await getDb();
      const topics = await listTopics(db, trackId);
      const res = await authedFetch(`/class/${cls.share_id}/progress`);
      if (seq !== progressSeq) return; // a newer open superseded this one
      topicTitles = new Map(topics.map((t) => [t.id, t.title])); // owner ids ARE the sids
      if (res.status === 204) {
        progressThin = true;
      } else if (res.ok) {
        progress = (await res.json()) as ClassProgress;
      } else {
        showToast('não deu para carregar o progresso da turma', 'error');
        progressFor = null;
      }
    } catch {
      if (seq !== progressSeq) return;
      showToast('não deu para carregar o progresso da turma', 'error');
      progressFor = null;
    }
  }

  function urlOf(cls: ClassRow): string {
    return `${location.origin}/import?share=${cls.share_id}`;
  }

  async function create(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const value = name.trim();
    if (value === '' || creating) return;
    creating = true;
    try {
      const snapshot = { ...(await buildTrackSnapshot(trackId)), class_name: value };
      const { id } = await publishSnapshot(snapshot);
      const db = await getDb();
      const deviceId = await getOrCreateDeviceId(db);
      await createClass(db, deviceId, { track_id: trackId, name: value, share_id: id });
      await live?.refresh();
      name = '';
      showToast(`turma "${value}" criada — link pronto`, 'success');
    } catch {
      showToast('não deu para criar a turma — verifique a conexão', 'error');
    } finally {
      creating = false;
    }
  }

  async function copy(cls: ClassRow): Promise<void> {
    try {
      await navigator.clipboard.writeText(urlOf(cls));
      showToast('link da turma copiado', 'success');
    } catch {
      showToast('não deu para copiar — selecione o link manualmente', 'error');
    }
  }

  async function remove(cls: ClassRow): Promise<void> {
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await deleteClass(db, deviceId, cls.id);
    await live?.refresh();
    showToast('turma removida — o link já distribuído segue válido', 'info');
  }
</script>

<section>
  <h2 class="flex items-center gap-1.5 type-label text-text-low">
    <NavIcon name="share" size={12} />
    turmas
  </h2>

  <ul data-testid="class-list" role="list" class="mt-3 flex flex-col">
    {#each classes as cls (cls.id)}
      <li
        data-testid="class-item"
        class="group border-t border-hairline py-2.5 first:border-t-0 first:pt-0"
      >
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-body">
            {cls.name}
          </span>
          <button
            data-testid="class-copy"
            type="button"
            aria-label="copiar link da turma {cls.name}"
            title="copiar link"
            onclick={() => void copy(cls)}
            class="type-meta cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            copiar
          </button>
          <button
            data-testid="class-qr"
            type="button"
            aria-expanded={qrFor === cls.id}
            aria-label="QR da turma {cls.name}"
            title="QR"
            onclick={() => (qrFor = qrFor === cls.id ? null : cls.id)}
            class="type-meta cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            qr
          </button>
          <button
            data-testid="class-progress-open"
            type="button"
            aria-expanded={progressFor === cls.id}
            aria-label="progresso da turma {cls.name}"
            title="progresso da turma"
            onclick={() => void openProgress(cls)}
            class="type-meta cursor-pointer text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            progresso
          </button>
          <button
            data-testid="class-delete"
            type="button"
            aria-label="remover turma {cls.name}"
            title="remover turma"
            onclick={() => void remove(cls)}
            class="icon-btn opacity-0 group-hover:opacity-100"
          >
            <NavIcon name="trash" size={12} />
          </button>
        </div>
        <input
          data-testid="class-share-url"
          type="text"
          readonly
          value={urlOf(cls)}
          aria-label="link da turma {cls.name}"
          class="type-meta mt-1.5 h-7 w-full rounded-base border border-hairline bg-transparent px-2 text-text-low"
        />
        {#if progressFor === cls.id}
          <div
            data-testid="class-progress-panel"
            class="mt-2 rounded-base border border-hairline bg-bg p-3"
          >
            {#if progressThin}
              <p data-testid="class-progress-empty" class="type-meta text-text-soft">
                poucos alunos compartilhando ainda — os números aparecem com 3 ou mais.
              </p>
            {:else if progress === null}
              <p class="type-meta text-text-soft">carregando…</p>
            {:else}
              <p data-testid="class-progress-count" class="type-item text-text-body tabular-nums">
                {progress.count} dispositivos · mediana {progress.median_done} tópicos ·
                ≈{progress.avg_week_minutes}min/semana
              </p>
              <ul role="list" class="mt-2 flex flex-col gap-1.5">
                {#each progress.topics as row (row.sid)}
                  <li data-testid="class-progress-topic-row" class="text-[11.5px] text-text-mid">
                    <span class="flex items-baseline justify-between gap-2">
                      <span class="min-w-0 truncate">{topicTitles.get(row.sid) ?? 'tópico'}</span>
                      <span class="shrink-0 text-text-low tabular-nums">
                        {Math.round(row.done_ratio * 100)}%
                      </span>
                    </span>
                    <span class="mt-0.5 block h-1 rounded-[2px] bg-hairline">
                      <span
                        class="block h-1 rounded-[2px] bg-success"
                        style="width:{row.done_ratio * 100}%"
                      ></span>
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
        {#if qrFor === cls.id}
          <div class="mt-2 w-32 overflow-hidden rounded-base bg-white p-1.5">
            <!-- eslint-disable-next-line svelte/no-at-html-tags — uqr emite SVG próprio -->
            {@html renderSVG(urlOf(cls), { border: 1 })}
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  <form data-testid="class-create-form" class="mt-3 flex gap-2" onsubmit={create}>
    <input
      data-testid="class-name-input"
      type="text"
      bind:value={name}
      placeholder="nome da turma · ex.: manhã 2026"
      autocomplete="off"
      class="type-item h-(--h-button-sm) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
    />
    <button
      data-testid="class-create-submit"
      type="submit"
      disabled={creating || name.trim() === ''}
      class="type-meta h-(--h-button-sm) cursor-pointer rounded-base border border-border px-3 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi disabled:cursor-not-allowed disabled:opacity-50"
    >
      criar turma
    </button>
  </form>
  <p class="type-meta mt-2 text-text-low">
    cada turma ganha um link próprio; entrar é local — nada de contas.
  </p>
</section>
