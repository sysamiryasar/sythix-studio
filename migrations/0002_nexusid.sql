-- 0002: NexusID — profiles, community graph, teams, achievements, cosmetics.

CREATE TABLE player_profiles (
  user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio                   TEXT NOT NULL DEFAULT '',
  avatar_source         TEXT NOT NULL DEFAULT 'initials' CHECK (avatar_source IN ('initials','minecraft')),
  banner_style          TEXT NOT NULL DEFAULT 'obsidian' CHECK (banner_style IN ('obsidian','nether','end','ocean','deepslate','amethyst')),
  accent_color          TEXT NOT NULL DEFAULT '#8b5cf6',
  visibility            TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','friends','private')),
  show_stats            INTEGER NOT NULL DEFAULT 1,
  show_achievements     INTEGER NOT NULL DEFAULT 1,
  show_servers          INTEGER NOT NULL DEFAULT 0,
  show_creations        INTEGER NOT NULL DEFAULT 1,
  allow_friend_requests INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE friendships (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending','accepted')),
  created_at   INTEGER NOT NULL,
  responded_at INTEGER,
  CHECK (requester_id <> addressee_id)
);
-- One relationship row per unordered pair.
CREATE UNIQUE INDEX uq_friendship_pair ON friendships(min(requester_id, addressee_id), max(requester_id, addressee_id));
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);

CREATE TABLE user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user','team','project')),
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('harassment','spam','impersonation','inappropriate_content','cheating','other')),
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by TEXT REFERENCES users(id),
  resolved_at INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_reports_status ON reports(status, created_at);

CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    TEXT NOT NULL REFERENCES users(id),
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE team_members (
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','member')),
  status     TEXT NOT NULL CHECK (status IN ('invited','active')),
  invited_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members(user_id, status);

CREATE TABLE achievements (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('identity','community','forge','server')),
  icon        TEXT NOT NULL,
  points      INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE user_achievements (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id),
  awarded_at     INTEGER NOT NULL,
  showcased      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE cosmetic_definitions (
  id             TEXT PRIMARY KEY,
  category       TEXT NOT NULL CHECK (category IN ('cape','headwear','wings','body_effect','trail','aura','particle','profile_decoration')),
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,
  rarity         TEXT NOT NULL CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
  -- Placeholder cosmetics are rendered procedurally from preview_style and are
  -- labelled as placeholders in the UI. Real assets will set asset_key (R2).
  is_placeholder INTEGER NOT NULL DEFAULT 1,
  asset_key      TEXT,
  preview_style  TEXT NOT NULL,
  unlock         TEXT NOT NULL CHECK (unlock IN ('starter','achievement','unavailable')),
  unlock_achievement_id TEXT REFERENCES achievements(id),
  created_at     INTEGER NOT NULL
);

CREATE TABLE cosmetic_inventory (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cosmetic_id TEXT NOT NULL REFERENCES cosmetic_definitions(id),
  source      TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, cosmetic_id)
);

CREATE TABLE cosmetic_loadout (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL REFERENCES cosmetic_definitions(id),
  PRIMARY KEY (user_id, category)
);

INSERT INTO achievements (id, name, description, category, icon, points) VALUES
  ('welcome',          'Welcome to SythiX',  'Verified your SythiX account.',                      'identity', 'sparkles', 5),
  ('profile_complete', 'Identity Forged',    'Added a bio and customised your profile banner.',    'identity', 'id-card', 10),
  ('first_friend',     'Party Up',           'Made your first friend on SythiX.',                  'community','users', 10),
  ('team_founder',     'Guild Founder',      'Created a team.',                                    'community','shield', 15),
  ('first_project',    'Blueprint',          'Created your first ForgeOS project.',                'forge',    'hammer', 10),
  ('first_export',     'Shipped It',         'Produced a validated ForgeOS export.',               'forge',    'package', 20),
  ('first_server',     'Server Architect',   'Connected a server agent to ServerOS.',              'server',   'server', 20),
  ('first_deploy',     'Pipeline Complete',  'Deployed a ForgeOS export to a connected server.',   'server',   'rocket', 30);

INSERT INTO cosmetic_definitions (id, category, name, description, rarity, is_placeholder, preview_style, unlock, unlock_achievement_id, created_at) VALUES
  ('cape_obsidian',    'cape',       'Obsidian Cape',       'A deep obsidian cape with violet trim.',          'common',    1, '{"primary":"#1a1325","secondary":"#8b5cf6"}', 'starter',     NULL, 0),
  ('cape_cyan_circuit','cape',       'Circuit Cape',        'Cyan circuit traces on graphite.',                'rare',      1, '{"primary":"#0f172a","secondary":"#22d3ee"}', 'achievement', 'first_export', 0),
  ('head_band_violet', 'headwear',   'Violet Headband',     'A simple headband in SythiX violet.',             'common',    1, '{"primary":"#7c3aed"}',                       'starter',     NULL, 0),
  ('head_crown_ender', 'headwear',   'Ender Circlet',       'A circlet set with an ender-blue gem.',           'epic',      1, '{"primary":"#3b82f6","secondary":"#a5f3fc"}', 'achievement', 'first_deploy', 0),
  ('wings_voxel',      'wings',      'Voxel Wings',         'Blocky wings of layered graphite.',               'legendary', 1, '{"primary":"#334155","secondary":"#8b5cf6"}', 'unavailable', NULL, 0),
  ('body_glint',       'body_effect','Enchanted Glint',     'A soft enchantment shimmer.',                     'uncommon',  1, '{"primary":"#c084fc"}',                       'achievement', 'profile_complete', 0),
  ('trail_sparks',     'trail',      'Redstone Sparks',     'A trail of red sparks.',                          'uncommon',  1, '{"primary":"#ef4444"}',                       'achievement', 'first_project', 0),
  ('aura_end',         'aura',       'End Aura',            'A faint purple aura.',                            'rare',      1, '{"primary":"#a855f7"}',                       'achievement', 'first_server', 0),
  ('particle_notes',   'particle',   'Note Blocks',         'Floating music notes.',                           'common',    1, '{"primary":"#22c55e"}',                       'starter',     NULL, 0),
  ('deco_frame_gold',  'profile_decoration','Gilded Frame', 'A gold frame around your profile avatar.',        'rare',      1, '{"primary":"#eab308"}',                       'achievement', 'first_friend', 0);
