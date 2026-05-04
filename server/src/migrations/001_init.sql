CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token        TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   INTEGER REFERENCES revisions(id),
  tree_json   TEXT    NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  message     TEXT    NOT NULL DEFAULT '',
  reverts_id  INTEGER REFERENCES revisions(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revisions_parent  ON revisions(parent_id);
CREATE INDEX IF NOT EXISTS idx_revisions_created ON revisions(created_at);

CREATE TABLE IF NOT EXISTS comments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id      TEXT    NOT NULL,
  author_id    INTEGER NOT NULL REFERENCES users(id),
  body         TEXT    NOT NULL,
  revision_id  INTEGER REFERENCES revisions(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_node    ON comments(node_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);
