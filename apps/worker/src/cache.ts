/**
 * Seam around the workerd Cache API: bun (tests) has no `caches` global, so
 * handlers go through getCache() and tests inject a fake via
 * setCacheForTesting(). Structural on purpose — only what the proxy needs.
 */
export interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
  delete(req: Request): Promise<boolean>;
}

// Minimal local view of the workerd global (no @cloudflare/workers-types here).
interface WorkerdCaches {
  default: CacheLike;
}

/**
 * Bun types Response.clone() as the undici base Response, which is not
 * assignable back to the global Response; at runtime it is the same object.
 * Recast here so callers can cache a clone and return the original.
 */
export function cloneResponse(res: Response): Response {
  return res.clone() as Response;
}

let testCache: CacheLike | null = null;

/** Test-only: inject a fake cache; pass null to restore the workerd default. */
export function setCacheForTesting(cache: CacheLike | null): void {
  testCache = cache;
}

export async function getCache(): Promise<CacheLike> {
  if (testCache) return testCache;
  const caches = (globalThis as { caches?: WorkerdCaches }).caches;
  if (!caches) {
    throw new Error('Cache API unavailable: outside workerd, inject one with setCacheForTesting');
  }
  return caches.default;
}
