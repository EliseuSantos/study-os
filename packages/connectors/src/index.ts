import type { Connector } from './types';
import { wikipediaConnector } from './wikipedia';
import { stackexchangeConnector } from './stackexchange';
import { youtubeConnector } from './youtube';

export type { Connector, ContentKind, ContentResult, FetchLike, TranscriptCue } from './types';
export { parseTimedText, decodeEntities } from './timedtext';
export { wikipediaConnector } from './wikipedia';
export { stackexchangeConnector } from './stackexchange';
export { youtubeConnector } from './youtube';

// Registry, stable order: wikipedia, stackexchange, youtube.
export const connectors: Connector[] = [
  wikipediaConnector,
  stackexchangeConnector,
  youtubeConnector,
];

export function getConnector(source: string): Connector | null {
  return connectors.find((c) => c.source === source) ?? null;
}
