CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  name TEXT NOT NULL,
  share_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_classes_track ON classes(track_id, deleted_at);
