<script lang="ts">
  // Popover over a text selection inside [data-seg] elements.
  // Emits segment-relative offsets — the caller anchors/persists them.
  import NavIcon from '$lib/components/NavIcon.svelte';

  export interface SelectionInfo {
    segIndex: number;
    start: number;
    end: number;
    quote: string;
  }

  let {
    container,
    onHighlight,
    onNote,
    onCard,
  }: {
    container: HTMLElement | null;
    onHighlight: (sel: SelectionInfo) => void;
    onNote: (sel: SelectionInfo) => void;
    onCard: (sel: SelectionInfo) => void;
  } = $props();

  let current = $state<SelectionInfo | null>(null);
  let pos = $state({ x: 0, y: 0, below: false });

  function segOf(node: Node | null): HTMLElement | null {
    let el = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
    while (el !== null && !el.dataset['seg']) el = el.parentElement;
    return el;
  }

  /** Offset of (node, nodeOffset) within seg's textContent. */
  function offsetIn(seg: HTMLElement, node: Node, nodeOffset: number): number {
    const walker = document.createTreeWalker(seg, NodeFilter.SHOW_TEXT);
    let total = 0;
    for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
      if (t === node) return total + nodeOffset;
      total += (t.textContent ?? '').length;
    }
    return total;
  }

  function readSelection(): void {
    const sel = window.getSelection();
    if (
      sel === null ||
      sel.isCollapsed ||
      sel.rangeCount === 0 ||
      container === null ||
      !container.contains(sel.anchorNode)
    ) {
      current = null;
      return;
    }
    const range = sel.getRangeAt(0);
    const segStart = segOf(range.startContainer);
    const segEnd = segOf(range.endContainer);
    // v1: selections must live inside a single segment
    if (segStart === null || segStart !== segEnd) {
      current = null;
      return;
    }
    const start = offsetIn(segStart, range.startContainer, range.startOffset);
    const end = offsetIn(segStart, range.endContainer, range.endOffset);
    if (end <= start) {
      current = null;
      return;
    }
    const text = segStart.textContent ?? '';
    const rect = range.getBoundingClientRect();
    const touch = window.matchMedia('(pointer: coarse)').matches;
    pos = {
      x: rect.left + rect.width / 2,
      y: touch ? rect.bottom + 8 : rect.top - 8,
      below: touch,
    };
    current = {
      segIndex: Number(segStart.dataset['seg']),
      start,
      end,
      quote: text.slice(start, end),
    };
  }

  function act(fn: (sel: SelectionInfo) => void): void {
    if (current === null) return;
    const sel = current;
    current = null;
    window.getSelection()?.removeAllRanges();
    fn(sel);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (current === null) return;
    if (event.key === 'Escape') {
      current = null;
    } else if (event.key === 'h' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      act(onHighlight);
    } else if (event.key === 'c' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      act(onCard);
    }
  }
</script>

<svelte:document
  onselectionchange={() => {
    // defer: the selection object settles after the event
    requestAnimationFrame(readSelection);
  }}
/>
<svelte:window onkeydown={onKeydown} />

{#if current !== null}
  <div
    data-testid="selection-actions"
    role="toolbar"
    aria-label="ações da seleção"
    class="fixed z-50 flex items-center overflow-hidden rounded-base border border-border bg-bg-deep shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
    style="left: {pos.x}px; top: {pos.y}px; transform: translate({'-50%'}, {pos.below
      ? '0'
      : '-100%'});"
  >
    <button
      data-testid="selection-highlight"
      type="button"
      onpointerdown={(e) => {
        e.preventDefault();
        act(onHighlight);
      }}
      class="type-meta flex cursor-pointer items-center gap-1.5 px-3 py-2 text-text-body transition-colors duration-(--dur-base) ease-brand hover:bg-surface hover:text-text-hi"
    >
      <span class="inline-block h-2.5 w-2.5 rounded-[2px] bg-(--accent-tint-12) outline outline-accent"
      ></span>
      destacar
    </button>
    <button
      data-testid="selection-note"
      type="button"
      onpointerdown={(e) => {
        e.preventDefault();
        act(onNote);
      }}
      class="type-meta flex cursor-pointer items-center gap-1.5 border-l border-hairline px-3 py-2 text-text-body transition-colors duration-(--dur-base) ease-brand hover:bg-surface hover:text-text-hi"
    >
      <NavIcon name="list" size={12} />
      nota
    </button>
    <button
      data-testid="selection-card"
      type="button"
      onpointerdown={(e) => {
        e.preventDefault();
        act(onCard);
      }}
      class="type-meta flex cursor-pointer items-center gap-1.5 border-l border-hairline px-3 py-2 text-text-body transition-colors duration-(--dur-base) ease-brand hover:bg-surface hover:text-text-hi"
    >
      <NavIcon name="plus" size={12} />
      criar card
    </button>
  </div>
{/if}
