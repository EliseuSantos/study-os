import type { SqlValue, Stmt } from '@studyos/db';

export type DbRequest =
  | { id: number; kind: 'exec'; sql: string; params?: SqlValue[] }
  | { id: number; kind: 'batch'; stmts: Stmt[]; mutates: string[] };

export type DbResponse =
  | { id: number; ok: true; rows: Record<string, SqlValue>[] }
  | { id: number; ok: false; error: string };

export type DbReady = { kind: 'ready' } | { kind: 'init-error'; error: string };

export type DbBroadcast = { kind: 'tables-changed'; tables: string[] };
