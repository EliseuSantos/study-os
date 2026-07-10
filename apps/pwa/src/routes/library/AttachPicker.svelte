<script lang="ts">
  import type { TopicRow, TrackRow } from '@studyos/shared';

  interface Props {
    tracks: TrackRow[];
    loadTopics: (trackId: string) => Promise<TopicRow[]>;
    onconfirm: (topic: TopicRow) => void;
  }

  const { tracks, loadTopics, onconfirm }: Props = $props();

  let trackId = $state('');
  let topicId = $state('');
  let topics = $state<TopicRow[]>([]);
  let saving = $state(false);

  const selectedTopic = $derived(topics.find((t) => t.id === topicId) ?? null);

  async function onTrackChange(): Promise<void> {
    topicId = '';
    topics = trackId === '' ? [] : await loadTopics(trackId);
  }

  function confirm(): void {
    if (selectedTopic === null || saving) return;
    saving = true;
    onconfirm(selectedTopic);
  }
</script>

<div
  data-testid="attach-picker"
  class="mt-3 flex flex-wrap items-end gap-3 border-t border-hairline pt-3"
>
  <div class="min-w-40 flex-1">
    <label class="type-label block text-text-low" for="attach-track">trilha</label>
    <select
      id="attach-track"
      data-testid="attach-track-select"
      bind:value={trackId}
      onchange={() => void onTrackChange()}
      class="type-item mt-2 h-(--h-button-md) w-full cursor-pointer rounded-base border border-border bg-surface px-3 text-text-body"
    >
      <option value="">escolha uma trilha</option>
      {#each tracks as track (track.id)}
        <option value={track.id}>{track.title}</option>
      {/each}
    </select>
  </div>

  <div class="min-w-40 flex-1">
    <label class="type-label block text-text-low" for="attach-topic">tópico</label>
    <select
      id="attach-topic"
      data-testid="attach-topic-select"
      bind:value={topicId}
      disabled={topics.length === 0}
      class="type-item mt-2 h-(--h-button-md) w-full cursor-pointer rounded-base border border-border bg-surface px-3 text-text-body disabled:cursor-default disabled:opacity-50"
    >
      <option value="">escolha um tópico</option>
      {#each topics as topic (topic.id)}
        <option value={topic.id}>{topic.title}</option>
      {/each}
    </select>
  </div>

  <button
    data-testid="attach-confirm"
    type="button"
    disabled={selectedTopic === null || saving}
    onclick={confirm}
    class="type-item h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-default disabled:opacity-50"
  >
    anexar
  </button>
</div>
