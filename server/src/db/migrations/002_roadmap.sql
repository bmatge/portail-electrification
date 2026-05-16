CREATE TABLE IF NOT EXISTS roadmap_revisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   INTEGER REFERENCES roadmap_revisions(id),
  data_json   TEXT    NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  message     TEXT    NOT NULL DEFAULT '',
  reverts_id  INTEGER REFERENCES roadmap_revisions(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roadmap_revisions_parent  ON roadmap_revisions(parent_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_revisions_created ON roadmap_revisions(created_at);
