CREATE TABLE class_progress (
  share_id TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (share_id, anon_id)
);
