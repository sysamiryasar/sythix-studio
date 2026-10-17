-- 0003: SythiX Connect — communities, channels, conversations and messages.

CREATE TABLE communities (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  created_at  INTEGER NOT NULL
);

CREATE TABLE community_members (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','admin','owner')),
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX idx_members_user ON community_members(user_id);

CREATE TABLE community_bans (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE community_invites (
  code         TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  max_uses     INTEGER,
  uses         INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE TABLE channels (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','announcement','voice')),
  topic        TEXT NOT NULL DEFAULT '',
  min_role     TEXT NOT NULL DEFAULT 'member' CHECK (min_role IN ('member','moderator','admin')),
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  UNIQUE (community_id, name)
);

CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('dm','group')),
  title           TEXT NOT NULL DEFAULT '',
  dm_key          TEXT UNIQUE,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL,
  last_message_at INTEGER
);

CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conv_members_user ON conversation_members(user_id);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  channel_id      TEXT REFERENCES channels(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  author_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  reply_to        TEXT REFERENCES messages(id) ON DELETE SET NULL,
  pinned          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  edited_at       INTEGER,
  deleted_at      INTEGER,
  CHECK ((channel_id IS NULL) <> (conversation_id IS NULL))
);
CREATE INDEX idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Read state for channels and conversations (target_id is either).
CREATE TABLE read_states (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id    TEXT NOT NULL,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_id)
);
