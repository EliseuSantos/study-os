export interface OutlineNode {
  title: string;
  depth: number;
  children: OutlineNode[];
}

// TODO(M2): parse markdown headings/lists into a topic tree.
export function parseOutline(_markdown: string): OutlineNode[] {
  throw new Error('not implemented (M2)');
}
