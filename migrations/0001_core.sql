-- 0001: Core platform — accounts, sessions, workspaces, RBAC, modules, audit, notifications.
-- Conventions: TEXT ids (prefixed random), INTEGER epoch-millisecond timestamps.

CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email_verified_at INTEGER,
  password_hash    TEXT NOT NULL,
  username         TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name     TEXT NOT NULL,
  platform_role    TEXT NOT NULL DEFAULT 'member' CHECK (platform_role IN ('member','platform_admin','platform_owner')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  revoked_at    INTEGER
);
CREATE INDEX idx_sessions_user ON sessions(user_id, revoked_at);

-- Single-use email verification and password reset tokens (hashed).
CREATE TABLE auth_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('email_verify','password_reset')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, kind);

-- External identities proven through a verified flow (e.g. Microsoft -> Minecraft Java).
CREATE TABLE verified_identities (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('minecraft_java')),
  provider_subject  TEXT NOT NULL,
  provider_name     TEXT NOT NULL,
  verified_at       INTEGER NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);

CREATE TABLE user_preferences (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme                TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
  sidebar_collapsed    INTEGER NOT NULL DEFAULT 0,
  reduced_motion       INTEGER NOT NULL DEFAULT 0,
  default_workspace_id TEXT,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  is_personal INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE workspace_memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL REFERENCES roles(id),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_workspace_memberships_user ON workspace_memberships(user_id);

-- Role and permission catalogue. The application's permission matrix
-- (src/lib/authz/roles.ts) must match these rows; a test enforces it.
CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL CHECK (scope IN ('platform','workspace','server')),
  name        TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE module_registrations (
  module_id         TEXT PRIMARY KEY,
  installed_version TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  installed_at      INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  health_status     TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown','healthy','degraded','unavailable')),
  health_detail     TEXT,
  health_checked_at INTEGER
);

CREATE TABLE feature_flags (
  key        TEXT NOT NULL,
  scope      TEXT NOT NULL CHECK (scope IN ('global','workspace')),
  scope_id   TEXT NOT NULL DEFAULT '',
  enabled    INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, scope, scope_id)
);

-- Append-only record of privileged actions. Intentionally no FKs so records
-- survive deletion of the things they describe.
CREATE TABLE audit_events (
  id           TEXT PRIMARY KEY,
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('user','agent','system')),
  actor_id     TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  workspace_id TEXT,
  server_id    TEXT,
  ip           TEXT,
  metadata     TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_audit_actor ON audit_events(actor_id, created_at);
CREATE INDEX idx_audit_server ON audit_events(server_id, created_at);
CREATE INDEX idx_audit_workspace ON audit_events(workspace_id, created_at);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at);

-- Fixed-window rate limiting counters.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- Outgoing email record. In development (no provider configured) this is the
-- only delivery channel and is viewable at /dev/outbox.
CREATE TABLE email_outbox (
  id         TEXT PRIMARY KEY,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_text  TEXT NOT NULL,
  provider   TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('stored','sent','failed')),
  created_at INTEGER NOT NULL
);

-- Roles ---------------------------------------------------------------------
INSERT INTO roles (id, scope, name, description) VALUES
  ('platform_owner',   'platform',  'Platform owner',       'Full control of the SythiX installation.'),
  ('platform_admin',   'platform',  'Platform administrator','Manages modules, flags, reports and users.'),
  ('member',           'platform',  'Member',               'A registered SythiX account.'),
  ('workspace_owner',  'workspace', 'Workspace owner',      'Owns the workspace and its membership.'),
  ('workspace_admin',  'workspace', 'Workspace administrator','Manages members and all workspace content.'),
  ('developer',        'workspace', 'Developer',            'Creates projects, exports and requests deployments.'),
  ('creator',          'workspace', 'Creator',              'Creates and edits ForgeOS projects.'),
  ('workspace_member', 'workspace', 'Workspace member',     'Read-only access to workspace projects.'),
  ('server_admin',     'server',    'Server administrator', 'Full control of a single server.'),
  ('server_moderator', 'server',    'Server moderator',     'Moderates players and reads the console of a single server.'),
  ('server_viewer',    'server',    'Server viewer',        'Views status and telemetry of a single server.');

INSERT INTO role_permissions (role_id, permission) VALUES
  ('platform_owner','platform.modules.manage'), ('platform_owner','platform.flags.manage'),
  ('platform_owner','platform.reports.review'), ('platform_owner','platform.users.manage'),
  ('platform_owner','platform.audit.read'),
  ('platform_admin','platform.modules.manage'), ('platform_admin','platform.flags.manage'),
  ('platform_admin','platform.reports.review'), ('platform_admin','platform.audit.read'),

  ('workspace_owner','workspace.manage'), ('workspace_owner','workspace.members.manage'),
  ('workspace_owner','project.view'), ('workspace_owner','project.create'), ('workspace_owner','project.edit'),
  ('workspace_owner','project.delete'), ('workspace_owner','project.export'), ('workspace_owner','project.deploy.request'),
  ('workspace_owner','server.register'), ('workspace_owner','server.list'), ('workspace_owner','audit.read'),
  ('workspace_admin','workspace.members.manage'),
  ('workspace_admin','project.view'), ('workspace_admin','project.create'), ('workspace_admin','project.edit'),
  ('workspace_admin','project.delete'), ('workspace_admin','project.export'), ('workspace_admin','project.deploy.request'),
  ('workspace_admin','server.register'), ('workspace_admin','server.list'), ('workspace_admin','audit.read'),
  ('developer','project.view'), ('developer','project.create'), ('developer','project.edit'),
  ('developer','project.export'), ('developer','project.deploy.request'), ('developer','server.list'),
  ('creator','project.view'), ('creator','project.create'), ('creator','project.edit'), ('creator','project.export'),
  ('workspace_member','project.view'),

  ('server_admin','server.view'), ('server_admin','server.manage'), ('server_admin','server.credentials.manage'),
  ('server_admin','server.members.manage'), ('server_admin','server.console.read'), ('server_admin','server.console.execute'),
  ('server_admin','server.players.moderate'), ('server_admin','server.plugins.read'), ('server_admin','server.plugins.manage'),
  ('server_admin','server.deploy'), ('server_admin','server.audit.read'),
  ('server_moderator','server.view'), ('server_moderator','server.console.read'),
  ('server_moderator','server.players.moderate'), ('server_moderator','server.plugins.read'),
  ('server_viewer','server.view');
