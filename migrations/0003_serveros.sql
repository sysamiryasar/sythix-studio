-- 0003: ServerOS — servers, scoped memberships, agent credentials, telemetry, console, commands.

CREATE TABLE servers (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  address      TEXT NOT NULL DEFAULT '',
  software     TEXT NOT NULL CHECK (software IN ('paper','purpur')),
  mc_version   TEXT NOT NULL,
  environment  TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production','staging','development')),
  description  TEXT NOT NULL DEFAULT '',
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_servers_workspace ON servers(workspace_id);

-- Server access is granted per server; workspace roles never imply it.
CREATE TABLE server_memberships (
  server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('server_admin','server_moderator','server_viewer')),
  granted_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);
CREATE INDEX idx_server_memberships_user ON server_memberships(user_id);

-- Only a SHA-256 hash of each agent token is stored. The token is shown once.
CREATE TABLE agent_credentials (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  token_prefix TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER,
  revoked_by   TEXT REFERENCES users(id)
);
CREATE INDEX idx_agent_credentials_server ON agent_credentials(server_id, revoked_at);

CREATE TABLE server_connections (
  server_id          TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  credential_id      TEXT,
  agent_version      TEXT,
  capabilities       TEXT NOT NULL DEFAULT '[]',
  reported_software  TEXT,
  reported_version   TEXT,
  first_connected_at INTEGER,
  last_heartbeat_at  INTEGER,
  connected_since    INTEGER,
  last_status        TEXT,
  updated_at         INTEGER NOT NULL
);

-- One summary row per server per minute. Retention: 7 days (pruned by the agent heartbeat path).
CREATE TABLE server_telemetry (
  server_id       TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  bucket_start    INTEGER NOT NULL,
  players_online  INTEGER,
  players_max     INTEGER,
  tps_1m          REAL,
  tps_5m          REAL,
  tps_15m         REAL,
  host_mem_used   INTEGER,
  host_mem_total  INTEGER,
  host_load_1m    REAL,
  host_cpu_count  INTEGER,
  PRIMARY KEY (server_id, bucket_start)
);

CREATE TABLE server_players (
  server_id     TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  uuid          TEXT NOT NULL,
  name          TEXT NOT NULL,
  online        INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  PRIMARY KEY (server_id, uuid)
);
CREATE INDEX idx_server_players_name ON server_players(server_id, name);

-- Rolling console buffer. Retention: newest 2000 lines per server.
CREATE TABLE server_console_lines (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  ts        INTEGER NOT NULL,
  level     TEXT NOT NULL DEFAULT 'INFO',
  line      TEXT NOT NULL
);
CREATE INDEX idx_console_server_seq ON server_console_lines(server_id, seq);

-- Typed operations queued for the agent. The agent pulls them on heartbeat
-- and re-validates every payload against its own local allowlist.
CREATE TABLE server_commands (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  payload      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('queued','dispatched','succeeded','failed','expired')),
  requested_by TEXT REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  dispatched_at INTEGER,
  completed_at INTEGER,
  result       TEXT
);
CREATE INDEX idx_server_commands_queue ON server_commands(server_id, status, created_at);

CREATE TABLE moderation_actions (
  id          TEXT PRIMARY KEY,
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_uuid TEXT,
  action      TEXT NOT NULL CHECK (action IN ('kick','ban','unban')),
  reason      TEXT NOT NULL DEFAULT '',
  actor_id    TEXT NOT NULL REFERENCES users(id),
  command_id  TEXT REFERENCES server_commands(id),
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_moderation_server ON moderation_actions(server_id, created_at);

-- Latest plugin inventory reported by the agent.
CREATE TABLE server_plugins (
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  version     TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  api_version TEXT,
  description TEXT,
  authors     TEXT,
  reported_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, name)
);
