-- 0001: SythiX ID — accounts, sessions, profiles, preferences, safety and platform plumbing.
-- Conventions: TEXT ids with a type prefix, INTEGER epoch-millisecond timestamps.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL COLLATE NOCASE UNIQUE,
  username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','admin','owner')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  ip           TEXT,
  user_agent   TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE profiles (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio                TEXT NOT NULL DEFAULT '',
  location           TEXT NOT NULL DEFAULT '',
  website            TEXT NOT NULL DEFAULT '',
  pronouns           TEXT NOT NULL DEFAULT '',
  accent             TEXT NOT NULL DEFAULT 'violet',
  banner             TEXT NOT NULL DEFAULT 'aurora',
  avatar_key         TEXT,
  profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public','followers','private')),
  dm_policy          TEXT NOT NULL DEFAULT 'followers' CHECK (dm_policy IN ('everyone','followers','nobody')),
  allow_mentions     INTEGER NOT NULL DEFAULT 1,
  show_activity      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE preferences (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme          TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
  reduced_motion INTEGER NOT NULL DEFAULT 0,
  nav_collapsed  INTEGER NOT NULL DEFAULT 0,
  dashboard      TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX idx_blocks_blocked ON user_blocks(blocked_id);

CREATE TABLE reports (
  id              TEXT PRIMARY KEY,
  reporter_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type     TEXT NOT NULL CHECK (target_type IN ('user','post','comment','message','community')),
  target_id       TEXT NOT NULL,
  reason          TEXT NOT NULL,
  details         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  resolved_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     INTEGER,
  resolution_note TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_reports_status ON reports(status, created_at);
CREATE UNIQUE INDEX uq_reports_open ON reports(reporter_id, target_type, target_id) WHERE status = 'open';

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        TEXT NOT NULL DEFAULT '{}',
  ip          TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
