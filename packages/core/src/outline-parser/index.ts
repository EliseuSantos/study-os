export interface OutlineNode {
  title: string;
  depth: number;
  children: OutlineNode[];
}

const LIST_RE = /^([ \t]*)(?:[-*]|\d+[.)])\s+(.+)$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

function indentWidth(prefix: string): number {
  let width = 0;
  for (const ch of prefix) width += ch === '\t' ? 2 : 1;
  return width;
}

interface HeadingFrame {
  level: number;
  node: OutlineNode;
}

interface ListFrame {
  indent: number;
  node: OutlineNode;
}

export function parseOutline(text: string): OutlineNode[] {
  const lines = text.split(/\r?\n/);

  let minHeadingLevel = 7;
  for (const line of lines) {
    const m = HEADING_RE.exec(line.trim());
    if (m?.[1]) minHeadingLevel = Math.min(minHeadingLevel, m[1].length);
  }

  const roots: OutlineNode[] = [];
  const headingStack: HeadingFrame[] = [];
  const listStack: ListFrame[] = [];

  const attach = (parent: OutlineNode | null, title: string): OutlineNode => {
    const node: OutlineNode = {
      title,
      depth: parent ? parent.depth + 1 : 0,
      children: [],
    };
    if (parent) parent.children.push(node);
    else roots.push(node);
    return node;
  };

  for (const raw of lines) {
    if (raw.trim() === '') continue;

    const list = LIST_RE.exec(raw);
    if (list) {
      const indent = indentWidth(list[1] ?? '');
      while (listStack.length > 0 && listStack[listStack.length - 1]!.indent >= indent) {
        listStack.pop();
      }
      const parent =
        listStack[listStack.length - 1]?.node ??
        headingStack[headingStack.length - 1]?.node ??
        null;
      const node = attach(parent, (list[2] ?? '').trim());
      listStack.push({ indent, node });
      continue;
    }

    const heading = HEADING_RE.exec(raw.trim());
    if (heading) {
      const level = heading[1]!.length;
      listStack.length = 0;
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      const parent = headingStack[headingStack.length - 1]?.node ?? null;
      const node: OutlineNode = {
        title: (heading[2] ?? '').trim(),
        depth: level - minHeadingLevel,
        children: [],
      };
      if (parent) parent.children.push(node);
      else roots.push(node);
      headingStack.push({ level, node });
      continue;
    }

    const node = attach(null, raw.trim());
    headingStack.length = 0;
    listStack.length = 0;
    listStack.push({ indent: -1, node });
  }

  return roots;
}
