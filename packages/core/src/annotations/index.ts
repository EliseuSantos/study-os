// Text anchoring for annotations: offsets into the immutable source text plus
// the quoted excerpt as verification and fallback (saved content never changes,
// but the render pipeline might).

export interface TextAnchor {
  start: number;
  end: number;
  quote: string;
  /** transcript-only: index of the segment the selection lives in */
  segment_index?: number;
}

export function makeAnchor(
  sourceText: string,
  start: number,
  end: number,
  segmentIndex?: number,
): TextAnchor | null {
  if (start < 0 || end > sourceText.length || start >= end) return null;
  const anchor: TextAnchor = { start, end, quote: sourceText.slice(start, end) };
  if (segmentIndex !== undefined) anchor.segment_index = segmentIndex;
  return anchor;
}

export interface ResolvedAnchor {
  start: number;
  end: number;
  exact: boolean;
}

/**
 * Resolve an anchor against the (possibly re-rendered) source text.
 * 1. offsets still match the quote → exact
 * 2. quote found elsewhere (first occurrence) → relocated
 * 3. quote gone → null (caller shows the orphaned quote instead)
 */
export function resolveAnchor(sourceText: string, anchor: TextAnchor): ResolvedAnchor | null {
  if (
    anchor.start >= 0 &&
    anchor.end <= sourceText.length &&
    sourceText.slice(anchor.start, anchor.end) === anchor.quote
  ) {
    return { start: anchor.start, end: anchor.end, exact: true };
  }
  const idx = sourceText.indexOf(anchor.quote);
  if (idx === -1 || anchor.quote.length === 0) return null;
  return { start: idx, end: idx + anchor.quote.length, exact: false };
}

/** Suggested card front for a selected excerpt (heuristic, editable by the user). */
export function suggestCardFront(quote: string): string {
  const clean = quote.replace(/\s+/g, ' ').trim();
  const head = clean.length <= 60 ? clean : `${clean.slice(0, 57).trimEnd()}…`;
  return `Explique: ${head}`;
}

/** Build a cloze pair from an excerpt and the selected span inside it. */
export function makeCloze(
  excerpt: string,
  start: number,
  end: number,
): { front_md: string; back_md: string } | null {
  if (start < 0 || end > excerpt.length || start >= end) return null;
  const hidden = excerpt.slice(start, end);
  return {
    front_md: `${excerpt.slice(0, start)}[…]${excerpt.slice(end)}`,
    back_md: `${excerpt.slice(0, start)}**${hidden}**${excerpt.slice(end)}`,
  };
}
