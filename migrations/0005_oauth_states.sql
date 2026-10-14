-- 0005: Short-lived OAuth state for external identity linking (PKCE verifier kept server-side).
CREATE TABLE oauth_states (
  state_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_oauth_states_expiry ON oauth_states(expires_at);
