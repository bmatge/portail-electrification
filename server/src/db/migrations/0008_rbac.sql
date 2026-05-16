-- Rôles utilisateurs (admin/editor/viewer) scope global ou projet.
-- `project_id` NULL = scope global.
-- Index UNIQUE sur (user, project ou NULL→0, role) pour empêcher les
-- doublons (IFNULL en SQLite pour gérer la NULL = NULL pas équivalent).

CREATE TABLE IF NOT EXISTS user_roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK(role IN ('admin', 'editor', 'viewer')),
  granted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique
  ON user_roles(user_id, IFNULL(project_id, 0), role);

CREATE INDEX IF NOT EXISTS idx_user_roles_user    ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_project ON user_roles(project_id);
