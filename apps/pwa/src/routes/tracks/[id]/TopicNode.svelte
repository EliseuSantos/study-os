<script lang="ts">
  import type { SvelteSet } from 'svelte/reactivity';
  // oxlint-disable-next-line import/no-self-import -- recursive component; svelte:self is deprecated in runes mode
  import TopicNode from './TopicNode.svelte';
  import TopicForm from './TopicForm.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
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
    class="topic-row flex items-center gap-1.5 rounded-base py-1.5 pr-1"
    class:topic-row-selected={isSelected}
    style="padding-left: {node.depth * 18}px"
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
      {#if actions.isFocused(topic.id)}
        <span
          data-testid="focus-chip"
          class="ml-1.5 rounded-chip bg-(--accent-tint-12) px-1.5 py-0.5 text-[10px] font-semibold text-accent"
        >
          foco
        </span>
      {/if}
    </button>

    <button
      type="button"
      data-testid="topic-focus-toggle"
      aria-pressed={actions.isFocused(topic.id)}
      aria-label="foco da semana em {topic.title}"
      title="foco da semana"
      class="add-child icon-btn h-6 w-6 {actions.isFocused(topic.id) ? 'text-accent' : ''}"
      onclick={() => actions.toggleFocus(topic)}
    >
      <NavIcon name="target" size={12} />
    </button>

    <button
      type="button"
      data-testid="topic-add-child"
      aria-label="adicionar subtópico em {topic.title}"
      title="adicionar subtópico"
      class="add-child icon-btn h-6 w-6"
      onclick={() => actions.openChildForm(topic.id)}
    >
      <NavIcon name="plus" size={12} />
    </button>
  </div>

  {#if openFormId === topic.id}
    <div class="py-3" style="padding-left: {(node.depth + 1) * 18}px">
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
  .topic-row {
    transition: background-color var(--dur-base) var(--ease);
  }
  .topic-row:hover {
    background: var(--surface-2);
  }
  .topic-row-selected,
  .topic-row-selected:hover {
    background: var(--accent-tint-09);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  /* quiet until the row is hovered or the button is focused */
  .add-child {
    opacity: 0;
  }
  .topic-row:hover .add-child,
  .add-child:focus-visible {
    opacity: 1;
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
