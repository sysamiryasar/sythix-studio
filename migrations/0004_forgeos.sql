-- 0004: ForgeOS — projects, revisions, items, abilities, equipment sets, assets, exports, deployments.

CREATE TABLE projects (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  namespace        TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  target_version   TEXT NOT NULL,
  folder           TEXT NOT NULL DEFAULT '',
  visibility       TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  current_revision INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  archived_at      INTEGER,
  UNIQUE (workspace_id, slug)
);
CREATE INDEX idx_projects_workspace ON projects(workspace_id, archived_at, updated_at);

-- Immutable snapshots of a project's full content.
CREATE TABLE project_versions (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  snapshot   TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, revision)
);

CREATE TABLE assets (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('texture','model')),
  name         TEXT NOT NULL,
  r2_key       TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  sha256       TEXT NOT NULL,
  metadata     TEXT NOT NULL DEFAULT '{}',
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  UNIQUE (project_id, kind, name)
);

CREATE TABLE items (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  identifier        TEXT NOT NULL,
  name              TEXT NOT NULL,
  base_material     TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('weapon','tool','armor','consumable','misc')),
  rarity            TEXT NOT NULL CHECK (rarity IN ('common','uncommon','rare','epic')),
  texture_asset_id  TEXT REFERENCES assets(id) ON DELETE SET NULL,
  data              TEXT NOT NULL DEFAULT '{}',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  UNIQUE (project_id, identifier)
);

CREATE TABLE abilities (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  identifier    TEXT NOT NULL,
  name          TEXT NOT NULL,
  template      TEXT NOT NULL,
  trigger_kind  TEXT NOT NULL,
  cooldown_ticks INTEGER NOT NULL,
  permission    TEXT,
  params        TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (project_id, identifier)
);

CREATE TABLE equipment_sets (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (project_id, identifier)
);

-- Per-project resource pack settings (description, icon).
CREATE TABLE resource_packs (
  project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  description   TEXT NOT NULL DEFAULT '',
  icon_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE export_jobs (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision       INTEGER NOT NULL,
  format         TEXT NOT NULL,
  target_version TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
  r2_key         TEXT,
  size_bytes     INTEGER,
  sha256         TEXT,
  report         TEXT NOT NULL,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_export_jobs_project ON export_jobs(project_id, created_at);

CREATE TABLE deployment_jobs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  export_id    TEXT NOT NULL REFERENCES export_jobs(id),
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('planned','dispatched','succeeded','failed','cancelled')),
  plan         TEXT NOT NULL,
  command_id   TEXT REFERENCES server_commands(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  confirmed_by TEXT REFERENCES users(id),
  confirmed_at INTEGER,
  result       TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_deployments_project ON deployment_jobs(project_id, created_at);
CREATE INDEX idx_deployments_server ON deployment_jobs(server_id, created_at);
CREATE INDEX idx_deployments_command ON deployment_jobs(command_id);

-- Public creations a user chooses to feature on their NexusID profile.
CREATE TABLE favorite_creations (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
