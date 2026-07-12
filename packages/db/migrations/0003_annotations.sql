CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  anchor_json TEXT NOT NULL,
  note_md TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_annotations_content ON annotations(content_item_id, deleted_at);
ALTER TABLE cards ADD COLUMN source_ref TEXT;
