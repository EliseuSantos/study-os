<script lang="ts">
  import type { ContentItemRow, LessonItemRow, TopicRow } from '@studyos/shared';
  import { parseQuiz } from '$lib/stores/present.svelte';

  let {
    item,
    topics,
    content,
    picked,
    onpick,
    compact = false,
  }: {
    item: LessonItemRow;
    topics: ReadonlyMap<string, TopicRow>;
    content: ReadonlyMap<string, ContentItemRow>;
    picked: number | undefined;
    onpick: (option: number) => void;
    compact?: boolean;
  } = $props();

  const quiz = $derived(item.kind === 'quiz' ? parseQuiz(item.body_md) : null);
  const topic = $derived(
    item.kind === 'topic' && item.topic_id !== null ? (topics.get(item.topic_id) ?? null) : null,
  );
  const contentItem = $derived(
    item.kind === 'content' && item.content_item_id !== null
      ? (content.get(item.content_item_id) ?? null)
      : null,
  );

  function paragraphs(text: string | null): string[] {
    return (text ?? '')
      .split(/\n{2,}/)
      .map((p) => p.trim().replace(/\n/g, ' '))
      .filter((p) => p !== '');
  }

  function optionClass(i: number): string {
    if (picked === undefined) {
      return 'cursor-pointer border-border text-text-body hover:border-text-low hover:text-text-hi';
    }
    if (quiz !== null && i === quiz.answer) return 'border-success bg-success text-bg-deep';
    if (i === picked) return 'border-border text-text-low';
    return 'border-hairline text-text-soft opacity-60';
  }
</script>

<!-- em-based sizing: `compact` shrinks the whole slide for the presenter split. -->
<div
  data-testid="slide"
  class="flex w-full max-w-[56em] flex-col {compact ? 'text-[9px]' : 'text-[16px] md:text-[18px]'}"
>
  {#if topic !== null}
    <h2
      class="font-display text-[4.2em] leading-[0.98] font-semibold tracking-[-0.03em] text-text-hi"
    >
      {topic.title}
    </h2>
    <div class="mt-[1.5em] flex flex-col gap-[0.9em]">
      {#each paragraphs(topic.notes_md) as p, i (i)}
        <p class="font-body text-[1em] leading-[1.65] text-text-mid">{p}</p>
      {/each}
    </div>
  {:else if quiz !== null}
    <h2
      class="font-display text-[2em] leading-[1.15] font-semibold tracking-[-0.02em] text-text-hi"
    >
      {quiz.q}
    </h2>
    <div class="mt-[2em] flex flex-col gap-[0.75em]" role="group" aria-label="alternativas">
      {#each quiz.options as option, i (i)}
        <button
          type="button"
          data-testid={picked !== undefined && i === quiz.answer
            ? 'quiz-correct'
            : `quiz-option-${i}`}
          onclick={() => onpick(i)}
          disabled={picked !== undefined}
          class="flex items-baseline gap-[0.9em] rounded-base border px-[1.2em] py-[0.9em] text-left transition-colors duration-(--dur-base) ease-brand {optionClass(
            i,
          )}"
        >
          <span class="font-display text-[0.85em] tabular-nums opacity-70" aria-hidden="true">
            {String.fromCharCode(97 + i)} ·
          </span>
          <span class="font-body text-[1.2em] leading-[1.4]">{option}</span>
        </button>
      {/each}
    </div>
  {:else if contentItem !== null}
    <h2
      class="font-display text-[2.4em] leading-[1.1] font-semibold tracking-[-0.02em] text-text-hi"
    >
      {contentItem.title}
    </h2>
    {#if contentItem.source === 'youtube' && contentItem.external_id !== null}
      <div
        class="mt-[1.5em] aspect-video w-full self-center overflow-hidden rounded-base border border-hairline"
      >
        <iframe
          class="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${contentItem.external_id}`}
          title={contentItem.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    {:else if contentItem.url !== null}
      <a
        href={contentItem.url}
        target="_blank"
        rel="noopener noreferrer"
        class="mt-[1.2em] font-display text-[1.2em] break-all text-accent underline underline-offset-4"
      >
        {contentItem.url}
      </a>
    {/if}
  {:else}
    <!-- note — and the defensive fallback for unresolved refs or bad quiz JSON. -->
    <div class="flex flex-col gap-[1em]">
      {#each paragraphs(item.body_md) as p, i (i)}
        <p class="font-body text-[1.4em] leading-[1.55] text-text-body">{p}</p>
      {:else}
        <p class="font-body text-[1.4em] leading-[1.55] text-text-soft">—</p>
      {/each}
    </div>
  {/if}
</div>
