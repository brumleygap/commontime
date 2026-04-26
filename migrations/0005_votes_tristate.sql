-- Expand votes.availability to tristate: 0=busy, 1=yes, 2=maybe
-- SQLite cannot ALTER a CHECK constraint, so we recreate the table.
CREATE TABLE votes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  availability INTEGER NOT NULL CHECK (availability IN (0, 1, 2)),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
  UNIQUE (participant_id, option_id)
);

INSERT INTO votes_new SELECT * FROM votes;

DROP TABLE votes;
ALTER TABLE votes_new RENAME TO votes;

CREATE INDEX idx_votes_option ON votes(option_id);
