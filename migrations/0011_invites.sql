ALTER TABLE users ADD COLUMN name TEXT;

CREATE TABLE invites (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id            INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  invitee_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token              TEXT NOT NULL UNIQUE,
  expires_at         TEXT NOT NULL,
  used_at            TEXT
);

CREATE INDEX idx_invites_token ON invites(token);
