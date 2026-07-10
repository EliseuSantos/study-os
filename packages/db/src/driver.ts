export type SqlValue = string | number | null | Uint8Array;

export interface Stmt {
  sql: string;
  params?: SqlValue[];
}

export type Row = Record<string, SqlValue>;

export interface DbDriver {
  exec(sql: string, params?: SqlValue[]): Promise<Row[]>;
  /** Executes all statements atomically: all succeed or none apply. */
  batch(stmts: Stmt[]): Promise<void>;
}
