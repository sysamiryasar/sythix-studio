-- 0002: SythiX Social — follows, posts, media, reactions, comments, bookmarks, hashtags, mentions.

CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX idx_follows_followee ON follows(followee_id);

CREATE TABLE posts (
  id            TEXT PRIMARY KEY,
  author_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL DEFAULT '',
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private','community')),
  community_id  TEXT,
  repost_of     TEXT REFERENCES posts(id) ON DELETE CASCADE,
  reaction_count INTEGER NOT NULL DEFAULT 0,
  comment_count  INTEGER NOT NULL DEFAULT 0,
  repost_count   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at    INTEGER NOT NULL,
  edited_at     INTEGER
);
CREATE INDEX idx_posts_author ON posts(author_id, created_at);
CREATE INDEX idx_posts_created ON posts(created_at);
CREATE UNIQUE INDEX uq_posts_repost ON posts(author_id, repost_of) WHERE repost_of IS NOT NULL;

-- Uploaded media. Rows start unattached (post_id/message_id NULL) and are
-- claimed by the uploader when they publish; unclaimed rows are swept daily.
CREATE TABLE media (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('image','video')),
  r2_key       TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  post_id      TEXT REFERENCES posts(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_media_post ON media(post_id, position);
CREATE INDEX idx_media_owner ON media(owner_id, created_at);

CREATE TABLE reactions (
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('like','fire','gg','wow','heart')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_reactions_user ON reactions(user_id, created_at);

CREATE TABLE comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  TEXT REFERENCES comments(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);

CREATE TABLE bookmarks (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE post_tags (
  tag        TEXT NOT NULL,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tag, post_id)
);
CREATE INDEX idx_post_tags_recent ON post_tags(created_at, tag);
