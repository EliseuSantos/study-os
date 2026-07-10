export type Op = 'upsert' | 'delete';

export interface OpLogEntry {
  tbl: string;
  row_id: string;
  op: Op;
  payload: string;
  updated_at: number;
  device_id: string;
}

export interface PushRequest {
  device_id: string;
  ops: OpLogEntry[];
}

export interface PushResponse {
  accepted: number;
}

export interface PullResponse {
  ops: OpLogEntry[];
  cursor: number;
  has_more: boolean;
}
