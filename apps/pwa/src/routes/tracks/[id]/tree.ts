import type { TopicRow } from '@studyos/shared';

export interface TopicNodeData {
  topic: TopicRow;
  depth: number;
  children: TopicNodeData[];
}

/** Callbacks the recursive tree node needs; owned by the page. */
export interface TreeActions {
  select(id: string): void;
  cycleStatus(topic: TopicRow): void;
  toggleCollapsed(id: string): void;
  openChildForm(id: string): void;
  closeForm(): void;
  submitChild(parentId: string | null, title: string): Promise<void>;
}

function setDepth(nodes: TopicNodeData[], depth: number): void {
  for (const node of nodes) {
    node.depth = depth;
    setDepth(node.children, depth + 1);
  }
}

/** Nest the flat position-ordered rows by parent_id; depth is derived from the walk. */
export function buildTopicTree(topics: TopicRow[]): TopicNodeData[] {
  const byId = new Map<string, TopicNodeData>();
  for (const topic of topics) byId.set(topic.id, { topic, depth: 0, children: [] });

  const roots: TopicNodeData[] = [];
  for (const topic of topics) {
    const node = byId.get(topic.id);
    if (!node) continue;
    const parent = topic.parent_id === null ? undefined : byId.get(topic.parent_id);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  setDepth(roots, 0);
  return roots;
}
