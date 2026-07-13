CREATE TABLE question_attempts (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX idx_question_attempts_card ON question_attempts(card_id);
