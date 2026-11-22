BEGIN;
CREATE TABLE IF NOT EXISTS review_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('vocabulary', 'correction')),
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  speech TEXT NOT NULL,
  locale TEXT NOT NULL,
  card_key TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  successes INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, kind, card_key)
);
CREATE INDEX IF NOT EXISTS review_cards_due ON review_cards(user_id, due_at);
PRAGMA user_version=2;
COMMIT;
