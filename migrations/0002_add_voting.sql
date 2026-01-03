-- People who vote in a poll
CREATE TABLE participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  name TEXT,
  edit_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

-- Individual votes (one row per option per participant)
CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  availability INTEGER NOT NULL CHECK (availability IN (0, 1)),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
  UNIQUE (participant_id, option_id)
);

-- Helpful indexes
CREATE INDEX idx_participants_poll ON participants(poll_id);
CREATE INDEX idx_votes_option ON votes(option_id);
