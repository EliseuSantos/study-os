// Minimal shim: this package has no @types/bun dependency; delete this file if
// @types/bun is ever added.
declare module 'bun:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export interface Expectation {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toThrow(expected?: string | RegExp): void;
  }
  export function expect(actual: unknown): Expectation;
}
