export interface Connector {
  source: string;
  search(q: string): Promise<unknown[]>;
  resolve(externalId: string): Promise<unknown | null>;
}

export const registry: Map<string, Connector> = new Map();
