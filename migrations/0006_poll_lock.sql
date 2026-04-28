ALTER TABLE polls ADD COLUMN chosen_option_id INTEGER REFERENCES poll_options(id);
