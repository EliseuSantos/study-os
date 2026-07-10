<script lang="ts">
  import type { SvelteSet } from 'svelte/reactivity';
  // oxlint-disable-next-line import/no-self-import -- recursive component; svelte:self is deprecated in runes mode
  import TopicNode from './TopicNode.svelte';
  import TopicForm from './TopicForm.svelte';
  import type { TopicNodeData, TreeActions } from './tree';

  let {
    node,
    selectedId,
    collapsed,
    openFormId,
    actions,
  }: {
    node: TopicNodeData;
    selectedId: string | null;
    collapsed: SvelteSet<string>;
    openFormId: string;
    actions: TreeActions;
  } = $props();

  const topic = $derived(node.topic);
  const isCollapsed = $derived(collapsed.has(node.topic.id));
  const isSelected = $derived(selectedId === node.topic.id);
  const status = $derived(
    topic.status === 'studying' || topic.status === 'done' ? topic.status : 'pending',
  );
  const statusLabel = $derived(
    status === 'done' ? 'dominado' : status === 'studying' ? 'estudando' : 'pendente',
  );
</script>

<li>
  <div
    data-testid="topic-item"
    class="topic-row flex items-center gap-2 border-b border-hairline py-2 pr-1"
    class:topic-row-selected={isSelected}
    style="padding-left: {node.depth * 20}px"
  >
    {#if node.children.length > 0}
      <button
        type="button"
        class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-micro text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? `expandir ${topic.title}` : `recolher ${topic.title}`}
        onclick={() => actions.toggleCollapsed(topic.id)}
      >
        {isCollapsed ? '▸' : '▾'}
      </button>
    {:else}
      <span class="h-6 w-6 shrink-0" aria-hidden="true"></span>
    {/if}

    <button
      type="button"
      data-testid="topic-status-toggle"
      class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center"
      aria-label="status: {statusLabel} · alternar"
      onclick={() => actions.cycleStatus(topic)}
    >
      <span
        class="dot"
        class:dot-pending={status === 'pending'}
        class:dot-studying={status === 'studying'}
        class:dot-done={status === 'done'}
        aria-hidden="true"
      ></span>
    </button>

    <button
      type="button"
      data-testid="topic-title"
      class="type-item min-w-0 flex-1 cursor-pointer text-left transition-colors duration-(--dur-base) ease-brand {isSelected
        ? 'text-text-hi'
        : 'text-text-body hover:text-text-hi'}"
      aria-current={isSelected ? 'true' : undefined}
      onclick={() => actions.select(topic.id)}
    >
      {topic.title}
    </button>

    <button
      type="button"
      data-testid="topic-add-child"
      aria-label="adicionar subtópico em {topic.title}"
      class="type-meta shrink-0 cursor-pointer rounded-micro border border-border px-2 py-1 text-text-low transition-colors duration-(--dur-base) ease-brand hover:text-text-mid"
      onclick={() => actions.openChildForm(topic.id)}
    >
      + subtópico
    </button>
  </div>

  {#if openFormId === topic.id}
    <div class="border-b border-hairline py-3" style="padding-left: {(node.depth + 1) * 20}px">
      <TopicForm
        label="novo subtópico"
        focusOnOpen
        oncreate={(title) => actions.submitChild(topic.id, title)}
        oncancel={() => actions.closeForm()}
      />
    </div>
  {/if}

  {#if node.children.length > 0 && !isCollapsed}
    <ul role="list">
      {#each node.children as child (child.topic.id)}
        <TopicNode node={child} {selectedId} {collapsed} {openFormId} {actions} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .topic-row-selected {
    background: var(--accent-tint-09);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot-pending {
    border: 1.5px solid var(--text-low);
  }

  .dot-studying {
    border: 2px solid var(--accent);
  }

  .dot-done {
    background: var(--success);
  }
</style>
