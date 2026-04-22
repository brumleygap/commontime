ALTER TABLE participants ADD COLUMN user_id INTEGER REFERENCES users(id);

CREATE INDEX idx_participants_user ON participants(poll_id, user_id);
