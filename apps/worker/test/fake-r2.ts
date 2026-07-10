import type { R2BucketLike, R2ObjectLike } from '../src/env';

/** In-memory R2 double; `getCalls` lets tests assert cache hits skip the bucket. */
export class FakeR2 implements R2BucketLike {
  private readonly store = new Map<string, Uint8Array>();
  getCalls = 0;

  async get(key: string): Promise<R2ObjectLike | null> {
    this.getCalls += 1;
    const bytes = this.store.get(key);
    if (bytes === undefined) return null;
    return {
      // copy so callers cannot mutate the stored bytes through the buffer
      arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    };
  }

  async put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown> {
    this.store.set(key, value instanceof Uint8Array ? value.slice() : new Uint8Array(value));
    return undefined;
  }

  get size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}
