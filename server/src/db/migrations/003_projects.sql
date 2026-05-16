-- Multi-projet : table `projects` + valeur par défaut pour ne rien casser
-- en présence de données existantes (qui sont rattachées au projet id=1).
-- Les ALTER TABLE ADD COLUMN sont gérés en JS (db.js) car SQLite ne supporte
-- pas IF NOT EXISTS pour ALTER, et on doit pouvoir relancer la migration.

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Projet par défaut pour les données existantes ; idempotent.
INSERT INTO projects (id, slug, name, description)
  SELECT 1, 'portail-electrification', 'Portail d''électrification',
         'Hub d''info plan d''électrification — projet d''origine.'
  WHERE NOT EXISTS (SELECT 1 FROM projects WHERE id = 1);

-- Stockage clé/valeur par projet pour les catalogues non-versionnés
-- (dispositifs, mesures, objectifs, drupal_structure...).
CREATE TABLE IF NOT EXISTS project_data (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         TEXT    NOT NULL,
  json_value  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by  INTEGER REFERENCES users(id),
  PRIMARY KEY (project_id, key)
);

CREATE INDEX IF NOT EXISTS idx_project_data_project ON project_data(project_id);
