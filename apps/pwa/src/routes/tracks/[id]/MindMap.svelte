<script lang="ts">
  import type { TopicRow } from '@studyos/shared';
  import { buildTopicTree, type TopicNodeData } from './tree';

  let {
    topics,
    selectedId,
    onSelect,
  }: {
    topics: TopicRow[];
    selectedId: string | null;
    onSelect: (id: string) => void;
  } = $props();

  const NODE_W = 210;
  const NODE_H = 36;
  const COL_W = 230;
  const ROW_H = 48;

  interface MapNode {
    topic: TopicRow;
    x: number;
    y: number;
  }

  interface MapLayout {
    nodes: MapNode[];
    edges: string[];
    width: number;
    height: number;
  }

  const layout = $derived.by((): MapLayout => {
    const roots = buildTopicTree(topics);
    const nodes: MapNode[] = [];
    const edges: string[] = [];
    let leafIndex = 0;
    let maxDepth = 0;

    // Post-order: leaves take sequential rows, parents center on their children.
    function walk(node: TopicNodeData): number {
      maxDepth = Math.max(maxDepth, node.depth);
      const x = node.depth * COL_W + 10;
      let y: number;
      if (node.children.length === 0) {
        y = leafIndex * ROW_H + ROW_H / 2;
        leafIndex += 1;
      } else {
        const childYs = node.children.map(walk);
        y = ((childYs[0] ?? 0) + (childYs[childYs.length - 1] ?? 0)) / 2;
        const childX = (node.depth + 1) * COL_W + 10;
        for (const childY of childYs) {
          edges.push(`M ${x + NODE_W} ${y} h 12 V ${childY} H ${childX}`);
        }
      }
      nodes.push({ topic: node.topic, x, y });
      return y;
    }

    for (const root of roots) walk(root);

    return {
      nodes,
      edges,
      width: (maxDepth + 1) * COL_W + 20,
      height: leafIndex * ROW_H + ROW_H / 2,
    };
  });

  function truncate(title: string): string {
    return title.length > 24 ? `${title.slice(0, 23)}…` : title;
  }

  function status(topic: TopicRow): 'pending' | 'studying' | 'done' {
    return topic.status === 'studying' || topic.status === 'done' ? topic.status : 'pending';
  }

  function onkeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(id);
  }
</script>

<div data-testid="track-mindmap" class="mt-4 max-h-[70vh] overflow-auto">
  <svg
    width={layout.width}
    height={layout.height}
    viewBox="0 0 {layout.width} {layout.height}"
    role="group"
    aria-label="mapa mental dos tópicos"
  >
    {#each layout.edges as edge, i (i)}
      <path d={edge} fill="none" stroke="var(--hairline)" stroke-width="1.5" />
    {/each}

    {#each layout.nodes as node (node.topic.id)}
      <g
        role="button"
        tabindex="0"
        aria-label={node.topic.title}
        aria-current={selectedId === node.topic.id ? 'true' : undefined}
        class="map-node"
        onclick={() => onSelect(node.topic.id)}
        onkeydown={(event) => onkeydown(event, node.topic.id)}
      >
        <rect
          x={node.x}
          y={node.y - NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx="8"
          fill="var(--surface)"
          stroke={selectedId === node.topic.id ? 'var(--accent)' : 'var(--hairline)'}
          stroke-width={selectedId === node.topic.id ? 1.5 : 1}
        />
        {#if status(node.topic) === 'done'}
          <circle cx={node.x + 16} cy={node.y} r="4" fill="var(--success)" />
        {:else if status(node.topic) === 'studying'}
          <circle cx={node.x + 16} cy={node.y} r="4" fill="var(--accent)" />
        {:else}
          <circle
            cx={node.x + 16}
            cy={node.y}
            r="4"
            fill="none"
            stroke="var(--text-low)"
            stroke-width="1.5"
          />
        {/if}
        <text
          x={node.x + 30}
          y={node.y}
          dominant-baseline="central"
          font-size="13"
          font-family="var(--font-display)"
          fill="var(--text-body)"
        >
          {truncate(node.topic.title)}
        </text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .map-node {
    cursor: pointer;
    outline: none;
  }

  /* Thicker than the selected stroke (1.5) so keyboard focus stays visible
     even on the already-selected node. */
  .map-node:focus-visible rect {
    stroke: var(--accent);
    stroke-width: 2.5;
  }
</style>
