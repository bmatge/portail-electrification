// Helpers de scoping multi-projet : extrait le slug depuis l'URL /p/{slug}/...
// et fabrique les chemins API/page correspondants.

const SLUG_RE = /^\/p\/([^/]+)/;

export function getProjectSlug() {
  const m = (window.location.pathname || '').match(SLUG_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

export function projectScopedApi(path) {
  const slug = getProjectSlug();
  if (!slug) throw new Error('Pas de slug de projet dans l\'URL.');
  return `/api/projects/${encodeURIComponent(slug)}${path}`;
}

export function projectPath(page = '') {
  const slug = getProjectSlug();
  if (!slug) return '/';
  return `/p/${encodeURIComponent(slug)}${page ? `/${page}` : ''}`;
}

let cachedProject = null;
export async function getCurrentProject() {
  if (cachedProject) return cachedProject;
  const slug = getProjectSlug();
  if (!slug) return null;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const { project } = await res.json();
    cachedProject = project;
    return project;
  } catch { return null; }
}

export async function listAllProjects() {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { projects } = await res.json();
  return projects;
}

// Préfixe une clé localStorage avec le slug du projet courant pour éviter
// les collisions entre projets (état déplié de l'arbre, etc.).
export function projectStorageKey(key) {
  const slug = getProjectSlug() || '_global';
  return `pe.${slug}.${key}`;
}
