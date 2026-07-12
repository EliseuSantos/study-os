<script lang="ts">
  import { untrack } from 'svelte';
  import { listErrorCards, type ErrorCardRow } from '@studyos/db';
  import { liveQuery, type LiveQuery } from '$lib/db/live.svelte';

  let { trackId }: { trackId: string } = $props();

  let live = $state.raw<LiveQuery<ErrorCardRow[]> | null>(null);
  $effect(() => {
    const lq = liveQuery((db) => listErrorCards(db, trackId), ['cards', 'fsrs_state'], []);
    untrack(() => {
      live?.destroy();
      live = lq;
    });
    return () => lq.destroy();
  });

  const errors = $derived(live?.value ?? []);

  function dueLabel(dueAt: number | null): string {
    if (dueAt === null) return 'entra na próxima revisão';
    const days = Math.ceil((dueAt - Date.now()) / 86_400_000);
    if (days <= 0) return 'revisão pendente';
    return `revisa em ${days} ${days === 1 ? 'dia' : 'dias'}`;
  }
</script>

<section data-testid="errors-panel">
  {#if errors.length === 0}
    <p class="type-item text-text-soft">
      nenhum erro registrado nesta trilha — quando errar uma questão, registre em
      estudar → registrar erro. o erro vira revisão.
    </p>
  {:else}
    <ul role="list" class="flex flex-col">
      {#each errors as error (error.id)}
        <li
          data-testid="error-item"
          class="border-t border-hairline py-3 first:border-t-0 first:pt-0"
        >
          <p class="text-[14px] font-medium text-text-body">{error.front_md}</p>
          <p class="type-meta mt-1 flex flex-wrap gap-x-3 text-text-low tabular-nums">
            <span>{error.topic_title}</span>
            <span>·</span>
            <span>{dueLabel(error.due_at)}</span>
            <span>·</span>
            <span>{new Date(error.created_at).toLocaleDateString('pt-BR')}</span>
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</section>
