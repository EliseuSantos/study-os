<script lang="ts">
  import { parseOutline, type OutlineNode } from '@studyos/core';
  import type { OutlineNodeInput } from '@studyos/db';

  let { onconfirm }: { onconfirm: (nodes: OutlineNodeInput[]) => Promise<void> } = $props();

  let open = $state(false);
  let text = $state('');
  let busy = $state(false);

  const nodes = $derived(text.trim() === '' ? [] : parseOutline(text));

  interface FlatNode {
    title: string;
    depth: number;
  }

  const flat = $derived.by(() => {
    const out: FlatNode[] = [];
    const walk = (list: OutlineNode[]): void => {
      for (const node of list) {
        out.push({ title: node.title, depth: node.depth });
        walk(node.children);
      }
    };
    walk(nodes);
    return out;
  });

  const countLabel = $derived(`${flat.length} ${flat.length === 1 ? 'tópico' : 'tópicos'}`);

  function toInput(node: OutlineNode): OutlineNodeInput {
    return { title: node.title, children: node.children.map(toInput) };
  }

  async function confirm() {
    if (flat.length === 0 || busy) return;
    busy = true;
    try {
      await onconfirm(nodes.map(toInput));
      text = '';
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<button
  data-testid="outline-import-open"
  type="button"
  aria-expanded={open}
  onclick={() => (open = !open)}
  class="type-meta h-(--h-button-sm) cursor-pointer rounded-base border border-border px-4 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
>
  importar edital
</button>

{#if open}
  <div class="mt-4 rounded-base border border-hairline p-4">
    <label class="type-label block text-text-low" for="outline-input">
      cole o edital · um tópico por linha, indente os subtópicos
    </label>
    <textarea
      id="outline-input"
      data-testid="outline-input"
      bind:value={text}
      rows="6"
      autocomplete="off"
      placeholder={'- direito constitucional\n  - princípios fundamentais\n  - direitos e garantias'}
      class="type-item mt-3 w-full rounded-base border border-border bg-surface p-3 text-text-body placeholder:text-text-low"
    ></textarea>

    <p class="type-meta mt-3 text-text-low" aria-live="polite">
      {flat.length === 0 ? 'a prévia aparece enquanto você digita.' : `prévia · ${countLabel}`}
    </p>
    <ul data-testid="outline-preview" role="list" class="mt-2">
      {#each flat as item, index (index)}
        <li
          data-testid="outline-preview-item"
          class="type-item border-b border-hairline py-1.5 text-text-body first:border-t"
          style="padding-left: {item.depth * 16}px"
        >
          {item.title}
        </li>
      {/each}
    </ul>

    <div class="mt-4 flex gap-2">
      <button
        data-testid="outline-confirm"
        type="button"
        disabled={flat.length === 0 || busy}
        onclick={confirm}
        class="h-(--h-button-md) cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90 disabled:cursor-default disabled:opacity-40"
      >
        {flat.length === 0 ? 'importar' : `importar · ${countLabel}`}
      </button>
      <button
        type="button"
        onclick={() => (open = false)}
        class="type-meta h-(--h-button-md) cursor-pointer rounded-base border border-border px-3 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        cancelar
      </button>
    </div>
  </div>
{/if}
