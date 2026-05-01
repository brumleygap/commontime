-- Passkey credentials: one row per registered passkey per user
CREATE TABLE passkey_credentials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT    NOT NULL UNIQUE, -- base64url-encoded credential ID
  public_key    TEXT    NOT NULL,        -- base64url-encoded COSE public key
  sign_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Short-lived WebAuthn challenges (register and authenticate)
CREATE TABLE webauthn_challenges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge  TEXT    NOT NULL,              -- base64url random bytes
  user_id    INTEGER REFERENCES users(id),  -- NULL for discoverable auth (unknown until assertion)
  type       TEXT    NOT NULL,              -- 'register' | 'authenticate'
  expires_at TEXT    NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);
