-- Track project ownership (utilisé par le RBAC editor:project:delete:own).
-- `created_by` est nullable : les projets existants restent à NULL ; le seed
-- service les attribuera au user système (id=1) une fois ce dernier garanti
-- en DB. NULL signifie "appartient à personne en particulier" → seul un
-- admin peut les supprimer (project:delete:own ne matche pas).

ALTER TABLE projects ADD COLUMN created_by INTEGER REFERENCES users(id);
