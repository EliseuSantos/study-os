import type { TranscriptCue } from './types';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes &amp; &lt; &gt; &quot; &apos; and numeric (&#39; / &#x27;) html entities. */
export function decodeEntities(input: string): string {
  return input.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g,
    (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      const codePoint =
        dec !== undefined
          ? Number.parseInt(dec, 10)
          : hex !== undefined
            ? Number.parseInt(hex, 16)
            : null;
      if (codePoint !== null) {
        return Number.isFinite(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      }
      return (name !== undefined ? NAMED_ENTITIES[name] : undefined) ?? match;
    },
  );
}

const TEXT_ELEMENT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
const START_ATTR_RE = /\bstart="([^"]*)"/;
const DUR_ATTR_RE = /\bdur="([^"]*)"/;

/** Parses youtube timedtext XML (`<text start="..." dur="...">escaped</text>`) into cues. */
export function parseTimedText(xml: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  for (const match of xml.matchAll(TEXT_ELEMENT_RE)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const start = Number.parseFloat(START_ATTR_RE.exec(attrs)?.[1] ?? '');
    if (!Number.isFinite(start)) continue;
    const dur = Number.parseFloat(DUR_ATTR_RE.exec(attrs)?.[1] ?? '');
    const text = decodeEntities(body).trim();
    if (text === '') continue;
    cues.push({ start, dur: Number.isFinite(dur) ? dur : 0, text });
  }
  return cues;
}
