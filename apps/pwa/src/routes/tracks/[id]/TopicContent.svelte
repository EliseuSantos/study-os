<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    deleteContent,
    getOrCreateDeviceId,
    listContentByTopic,
    listSessionNotes,
    type SessionNoteRow,
  } from '@studyos/db';
  import type { ContentItemRow } from '@studyos/shared';
  import { getDb } from '$lib/db/client';
  import { liveQuery } from '$lib/db/live.svelte';

  let { topicId }: { topicId: string } = $props();

  const contentLive = liveQuery(
    (db) => listContentByTopic(db, topicId),
    ['content_items'],
    [] as ContentItemRow[],
  );
  const items = $derived(contentLive.value);

  const notesLive = liveQuery(
    (db) => listSessionNotes(db, topicId),
    ['sessions'],
    [] as SessionNoteRow[],
  );
  const explanations = $derived(notesLive.value);

  $effect(() => {
    void topicId;
    void contentLive.refresh();
    void notesLive.refresh();
  });

  onDestroy(() => {
    contentLive.destroy();
    notesLive.destroy();
  });

  const KIND_LABEL: Record<string, string> = {
    video: 'vídeo',
    article: 'artigo',
    qa: 'pergunta',
    doc: 'documento',
  };

  function badge(item: ContentItemRow): string {
    return `${KIND_LABEL[item.kind] ?? item.kind} · ${item.source}`;
  }

  function hrefFor(item: ContentItemRow): string | null {
    if (item.source === 'youtube' && item.external_id !== null) {
      return `/library/watch/${item.external_id}`;
    }
    if (item.source === 'web' && item.url !== null) {
      return `/library/read?url=${encodeURIComponent(item.url)}`;
    }
    return item.url;
  }

  async function remove(id: string): Promise<void> {
    const db = await getDb();
    const deviceId = await getOrCreateDeviceId(db);
    await deleteContent(db, deviceId, id);
    await contentLive.refresh();
  }
</script>

{#if items.length > 0}
  <section class="mt-12">
    <h2 class="type-label text-text-low">conteúdo</h2>

    <ul data-testid="topic-content-list" role="list" class="mt-4">
      {#each items as item (item.id)}
        {@const href = hrefFor(item)}
        {@const external = href !== null && href.startsWith('http')}
        <li
          data-testid="topic-content-item"
          class="flex items-center gap-3 border-b border-hairline py-3 first:border-t"
        >
          {#if href !== null}
            <a
              {href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              class="type-item min-w-0 flex-1 truncate text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
            >
              {item.title}
            </a>
          {:else}
            <span class="type-item min-w-0 flex-1 truncate text-text-body">{item.title}</span>
          {/if}
          <span class="type-meta shrink-0 text-text-low">{badge(item)}</span>
          <button
            data-testid="topic-content-remove"
            type="button"
            aria-label="remover conteúdo"
            onclick={() => void remove(item.id)}
            class="shrink-0 cursor-pointer leading-none text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if explanations.length > 0}
  <section data-testid="topic-explanations" class="mt-6">
    <h3 class="type-label text-text-low">suas explicações</h3>
    <ul role="list" class="mt-2">
      {#each explanations as note (note.id)}
        <li class="border-t border-hairline py-2.5 first:border-t-0">
          <p class="font-body text-[13.5px] text-text-reading italic">“{note.notes}”</p>
          <p class="type-meta mt-1 text-text-low tabular-nums">
            {new Date(note.started_at).toLocaleDateString('pt-BR')}
          </p>
        </li>
      {/each}
    </ul>
  </section>
{/if}
