CREATE TABLE poll_dismissals (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poll_token TEXT    NOT NULL,
  dismissed_at TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_id, poll_token)
);
