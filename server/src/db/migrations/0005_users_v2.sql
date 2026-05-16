-- Users v2 — renomme `name` en `display_name`, ajoute email + status + locale.
-- L'index UNIQUE case-insensitive sur email est conditionnel (WHERE email IS
-- NOT NULL) pour autoriser les users legacy non encore ré-onboardés.
--
-- Stratégie users legacy : `display_name` est backfilled à partir de `name`
-- via le RENAME ; `email` reste NULL jusqu'à ce que l'utilisateur consomme
-- son magic link via le script ops/seed-invites.ts (Phase 9 du plan).

ALTER TABLE users RENAME COLUMN name TO display_name;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK(status IN ('active', 'disabled', 'pending'));
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'fr-FR';
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
