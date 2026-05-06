ALTER TABLE polls ADD COLUMN rescheduled_poll_token TEXT NULL REFERENCES polls(token);
