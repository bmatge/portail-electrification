-- Sessions v2 — recrée la table avec :
-- - id PK auto-incrémenté (les revisions tracées en audit_log peuvent référer
--   à un id stable, pas à un token)
-- - token_hash UNIQUE (jamais de token en clair en DB)
-- - previous_id pour la rotation (chaîne de sessions, détection de replay)
-- - expires_at absolu (30j typique) + revoked_at (logout-all)
--
-- Les sessions v1 (table `sessions` avec token PRIMARY KEY) sont **invalidées
-- en bloc** par cette migration : tous les users se reconnectent via magic
-- link au prochain accès. Acceptable car opération de cutover documentée.

DROP TABLE IF EXISTS sessions;

CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip           TEXT,
  user_agent   TEXT,
  previous_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  expires_at   TEXT    NOT NULL,
  revoked_at   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
