import type { Connector } from './types';
import { wikipediaConnector } from './wikipedia';
import { stackexchangeConnector } from './stackexchange';
import { youtubeConnector } from './youtube';
import { webConnector } from './web';

export type { Connector, ContentKind, ContentResult, FetchLike, TranscriptCue } from './types';
export { rankByRelevance, titleTermScore } from './types';
export { parseTimedText, decodeEntities } from './timedtext';
export { wikipediaConnector } from './wikipedia';
export { stackexchangeConnector } from './stackexchange';
export { youtubeConnector } from './youtube';
export { webConnector } from './web';

// Registry, stable order: wikipedia, stackexchange, youtube, web.
export const connectors: Connector[] = [
  wikipediaConnector,
  stackexchangeConnector,
  youtubeConnector,
  webConnector,
];

export function getConnector(source: string): Connector | null {
  return connectors.find((c) => c.source === source) ?? null;
}
