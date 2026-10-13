-- 0006: Agent details — simulated-mode flag, ban list snapshot.

-- Agents started with mode "simulated" report it; the UI labels such servers as a sample environment.
ALTER TABLE server_connections ADD COLUMN simulated INTEGER NOT NULL DEFAULT 0;
-- Set when a disconnect notification was sent, cleared on the next heartbeat.
ALTER TABLE server_connections ADD COLUMN disconnect_notified_at INTEGER;

-- Snapshot of banned-players.json as last reported by the agent.
CREATE TABLE server_bans (
  server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  uuid       TEXT NOT NULL,
  name       TEXT NOT NULL,
  reason     TEXT,
  source     TEXT,
  created    TEXT,
  expires    TEXT,
  PRIMARY KEY (server_id, uuid)
);
