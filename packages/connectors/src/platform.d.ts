// Minimal ambient declarations for the web platform globals this package
// relies on: tsconfig.base uses lib es2023 (no DOM) and this package has no
// @types/bun. At runtime these globals exist in browsers, workers and bun.
// Structural on purpose — consumers compiling with lib.dom (or @types/bun)
// resolve the real types instead and never load this file.

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: unknown;
}

interface Response {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

declare var Response: {
  prototype: Response;
  new (
    body?: string | null,
    init?: { status?: number; headers?: Record<string, string> },
  ): Response;
};
