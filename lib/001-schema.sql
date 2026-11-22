BEGIN;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS ai_characters (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS learning_topics (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS learning_scenarios (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES learning_topics(id), payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  character_id TEXT NOT NULL REFERENCES ai_characters(id), topic_id TEXT NOT NULL REFERENCES learning_topics(id),
  mode TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, active_seconds INTEGER
);
CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES conversation_sessions(id),
  turn_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL, source TEXT NOT NULL, UNIQUE(session_id, turn_id, role)
);
CREATE TABLE IF NOT EXISTS speaking_assessments (
  session_id TEXT PRIMARY KEY REFERENCES conversation_sessions(id), payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vocabulary_items (id TEXT PRIMARY KEY, term TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS user_vocabulary (
  user_id TEXT REFERENCES users(id), item_id TEXT REFERENCES vocabulary_items(id), PRIMARY KEY(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS learning_progress (
  user_id TEXT REFERENCES users(id), date TEXT, active_seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,date)
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id), payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_date ON conversation_sessions(started_at DESC);
INSERT OR IGNORE INTO users VALUES ('local');
PRAGMA user_version=1;
COMMIT;
