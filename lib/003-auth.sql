BEGIN;
CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES accounts(user_id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_sessions_expiry ON login_sessions(expires_at);
CREATE INDEX IF NOT EXISTS sessions_by_owner ON conversation_sessions(user_id, ended_at DESC);
PRAGMA user_version=3;
COMMIT;
