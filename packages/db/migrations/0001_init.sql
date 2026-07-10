CREATE TABLE goals (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  target_date INTEGER, status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE tracks (
  id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id),
  title TEXT NOT NULL, description TEXT,
  mode TEXT NOT NULL DEFAULT 'schedule',
  origin TEXT, origin_version TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE topics (
  id TEXT PRIMARY KEY, track_id TEXT NOT NULL REFERENCES tracks(id),
  parent_id TEXT REFERENCES topics(id),
  title TEXT NOT NULL, notes_md TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE topic_deps (
  topic_id TEXT NOT NULL REFERENCES topics(id),
  depends_on_id TEXT NOT NULL REFERENCES topics(id),
  PRIMARY KEY (topic_id, depends_on_id)
);
CREATE TABLE cycle_slots (
  id TEXT PRIMARY KEY, track_id TEXT NOT NULL REFERENCES tracks(id),
  topic_id TEXT NOT NULL REFERENCES topics(id),
  weight INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE lessons (
  id TEXT PRIMARY KEY, track_id TEXT NOT NULL REFERENCES tracks(id),
  title TEXT NOT NULL, presenter_notes_md TEXT, estimated_duration_min INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE content_items (
  id TEXT PRIMARY KEY, topic_id TEXT REFERENCES topics(id),
  source TEXT NOT NULL,
  external_id TEXT, url TEXT, title TEXT NOT NULL,
  kind TEXT NOT NULL,
  meta_json TEXT, added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE lesson_items (
  id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id),
  topic_id TEXT REFERENCES topics(id), content_item_id TEXT REFERENCES content_items(id),
  kind TEXT NOT NULL,
  body_md TEXT, position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE cards (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id),
  kind TEXT NOT NULL DEFAULT 'basic',
  front_md TEXT NOT NULL, back_md TEXT, options_json TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE fsrs_state (
  id TEXT PRIMARY KEY,
  ref_kind TEXT NOT NULL, ref_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'new',
  stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0,
  due_at INTEGER, last_review INTEGER,
  reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE (ref_kind, ref_id)
);
CREATE TABLE review_logs (
  id TEXT PRIMARY KEY, fsrs_id TEXT NOT NULL REFERENCES fsrs_state(id),
  rating INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL, elapsed_ms INTEGER
);
CREATE TABLE routines (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, track_id TEXT REFERENCES tracks(id),
  rrule TEXT NOT NULL, start_time TEXT NOT NULL, duration_min INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, track_id TEXT REFERENCES tracks(id), topic_id TEXT REFERENCES topics(id),
  type TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER,
  net_seconds INTEGER NOT NULL DEFAULT 0, focused INTEGER NOT NULL DEFAULT 0,
  pages_read INTEGER, videos_watched INTEGER,
  questions_total INTEGER, questions_correct INTEGER, notes TEXT,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY, ref_kind TEXT NOT NULL, ref_id TEXT NOT NULL,
  title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE targets (
  id TEXT PRIMARY KEY, track_id TEXT REFERENCES tracks(id),
  metric TEXT NOT NULL,
  period TEXT NOT NULL,
  value REAL NOT NULL,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE reminders (
  id TEXT PRIMARY KEY, title TEXT NOT NULL,
  ref_kind TEXT, ref_id TEXT,
  notify_at INTEGER NOT NULL, rrule TEXT,
  updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE oplog (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl TEXT NOT NULL, row_id TEXT NOT NULL, op TEXT NOT NULL,
  payload TEXT NOT NULL, updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE server_oplog (
  tbl TEXT NOT NULL, row_id TEXT NOT NULL, op TEXT NOT NULL,
  payload TEXT NOT NULL, updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY (tbl, row_id)
);
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE track_shares (
  id TEXT PRIMARY KEY, version_hash TEXT NOT NULL, r2_key TEXT NOT NULL,
  title TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX idx_fsrs_due ON fsrs_state(due_at);
CREATE INDEX idx_topics_track_parent ON topics(track_id, parent_id);
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_oplog_synced ON oplog(synced);
CREATE INDEX idx_server_oplog_updated ON server_oplog(updated_at);
CREATE INDEX idx_content_topic ON content_items(topic_id)
