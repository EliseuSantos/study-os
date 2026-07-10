<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createTracksStore } from '$lib/stores/tracks.svelte';

  const store = createTracksStore();
  let title = $state('');

  onDestroy(() => store.destroy());

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    const value = title;
    title = '';
    void store.add(value);
  }
</script>

<svelte:head>
  <title>StudyOS — trilhas</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-8">
  <p class="type-label text-text-low">estudo</p>
  <h1 class="type-h1 mt-2 text-text-hi">trilhas</h1>

  <form data-testid="track-form" class="mt-8" {onsubmit}>
    <label class="type-label block text-text-low" for="track-title">nova trilha</label>
    <div class="mt-3 flex gap-2">
      <input
        id="track-title"
        data-testid="track-title-input"
        type="text"
        bind:value={title}
        placeholder="ex.: edital TRF · analista judiciário"
        autocomplete="off"
        class="type-item h-(--h-button-md) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
      />
      <button
        data-testid="track-submit"
        type="submit"
        class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
      >
        criar trilha
      </button>
    </div>
  </form>

  <ul data-testid="track-list" role="list" class="mt-8">
    {#each store.tracks as track (track.id)}
      <li class="border-b border-hairline first:border-t">
        <a
          data-testid="track-item"
          href={`/tracks/${track.id}`}
          class="type-item flex items-center justify-between gap-3 py-3 text-text-body transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        >
          <span class="min-w-0">{track.title}</span>
          <span class="type-meta shrink-0 text-text-low" aria-hidden="true">→</span>
        </a>
      </li>
    {/each}
  </ul>

  {#if store.tracks.length === 0}
    <p class="type-item mt-2 text-text-soft">
      nenhuma trilha ainda — importe um edital ou crie a primeira.
    </p>
  {/if}
</section>
