-- 0010 — Visibilité publique par projet.
--
-- Ajoute un flag `is_public` qui ouvre la lecture (GET) du projet aux
-- utilisateurs non authentifiés. Les écritures restent strictement
-- protégées par authorize('*:write').
--
-- Default `1` : iso-fonctionnel avec la v1 (entièrement publique).
-- Les editor/admin du projet peuvent basculer un projet en privé via
-- PATCH /api/projects/:slug.

ALTER TABLE projects ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;
