// Project picker : liste les projets et permet d'en créer un nouveau.

import { listAllProjects } from './project.js';
import { ensureIdentified, escapeHtml } from './collab.js';

const listEl = document.getElementById('projects-list');
const formEl = document.getElementById('new-project-form');
const errEl = document.getElementById('np-error');
const nameEl = document.getElementById('np-name');
const slugEl = document.getElementById('np-slug');
const descEl = document.getElementById('np-desc');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

// Auto-fill slug from name (tant que l'utilisateur n'a pas tapé son propre slug)
let slugTouched = false;
slugEl.addEventListener('input', () => { slugTouched = slugEl.value !== ''; });
nameEl.addEventListener('input', () => {
  if (!slugTouched) slugEl.value = slugify(nameEl.value);
});

async function renderProjects() {
  try {
    const projects = await listAllProjects();
    listEl.innerHTML = '';
    if (projects.length === 0) {
      listEl.innerHTML = '<p class="panel-empty">Aucun projet pour l\'instant. Créez-en un à droite.</p>';
      return;
    }
    for (const p of projects) {
      const a = document.createElement('a');
      a.href = `/p/${encodeURIComponent(p.slug)}/objectifs`;
      a.className = 'project-card';
      a.setAttribute('role', 'listitem');
      a.innerHTML = `
        <div class="project-card__head">
          <strong class="project-card__name">${escapeHtml(p.name)}</strong>
          <span class="project-card__slug">/p/${escapeHtml(p.slug)}</span>
        </div>
        ${p.description ? `<p class="project-card__desc">${escapeHtml(p.description)}</p>` : ''}
        <div class="project-card__meta">
          <span>${p.revision_count} révision${p.revision_count > 1 ? 's' : ''}</span>
          <span>créé le ${new Date(p.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')}</span>
        </div>
      `;
      listEl.appendChild(a);
    }
  } catch (e) {
    listEl.innerHTML = `<p class="panel-empty">Impossible de charger les projets : ${escapeHtml(e.message)}.</p>`;
  }
}

function showError(msg) {
  errEl.hidden = !msg;
  errEl.textContent = msg || '';
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const name = nameEl.value.trim();
  const slug = slugEl.value.trim();
  const description = descEl.value.trim();
  if (!name || !slug) { showError('Nom et identifiant sont obligatoires.'); return; }

  await ensureIdentified();
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, description }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.error === 'slug_taken') showError('Cet identifiant est déjà utilisé.');
      else if (body.error === 'invalid_slug') showError(body.detail || 'Identifiant invalide.');
      else showError(body.error || `Erreur HTTP ${res.status}`);
      return;
    }
    window.location.href = `/p/${encodeURIComponent(body.project.slug)}/objectifs`;
  } catch (e2) {
    showError('Erreur réseau : ' + e2.message);
  }
});

renderProjects();
