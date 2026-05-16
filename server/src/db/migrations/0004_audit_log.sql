-- Audit log : trace les mutations significatives (create/update/delete/import)
-- pour la traçabilité interne. Lu par la future UI admin (Phase 4) et par les
-- diagnostics. Pas de cascade : un user supprimé garde son audit (actor_id
-- nullable).

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT    NOT NULL,
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  resource_type TEXT,
  resource_id   TEXT,
  details       TEXT,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_project    ON audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created    ON audit_log(created_at);
