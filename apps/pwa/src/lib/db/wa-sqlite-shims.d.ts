/* Quarantined shims for untyped wa-sqlite modules and Vite asset queries.
   The upstream example VFS ships as plain JS, hence the single `any` below. */

declare module '@journeyapps/wa-sqlite/src/examples/OPFSCoopSyncVFS.js' {
  export const OPFSCoopSyncVFS: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(name: string, module: unknown): Promise<any>;
  };
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare module '*.sql?raw' {
  const sql: string;
  export default sql;
}
