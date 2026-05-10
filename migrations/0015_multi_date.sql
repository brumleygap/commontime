CREATE TABLE chosen_poll_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  UNIQUE(poll_id, option_id)
);

INSERT INTO chosen_poll_options (poll_id, option_id)
SELECT id, chosen_option_id FROM polls WHERE chosen_option_id IS NOT NULL;
