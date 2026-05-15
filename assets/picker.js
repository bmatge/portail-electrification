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
      const card = document.createElement('div');
      card.className = 'project-card project-card--with-actions';
      card.setAttribute('role', 'listitem');

      const link = document.createElement('a');
      link.href = `/p/${encodeURIComponent(p.slug)}/objectifs`;
      link.className = 'project-card__link';
      link.innerHTML = `
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
      card.appendChild(link);

      const actions = document.createElement('div');
      actions.className = 'project-card__actions';

      const exportBtn = document.createElement('a');
      exportBtn.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-download-line fr-btn--icon-left';
      exportBtn.href = `/api/projects/${encodeURIComponent(p.slug)}/export`;
      exportBtn.setAttribute('download', `projet-${p.slug}.json`);
      exportBtn.title = `Exporter "${p.name}" en JSON`;
      exportBtn.textContent = 'Exporter';
      exportBtn.addEventListener('click', (e) => e.stopPropagation());
      actions.appendChild(exportBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-delete-line fr-btn--icon-left project-card__delete';
      deleteBtn.title = `Supprimer "${p.name}"`;
      deleteBtn.textContent = 'Supprimer';
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDeleteDialog(p);
      });
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      listEl.appendChild(card);
    }
  } catch (e) {
    listEl.innerHTML = `<p class="panel-empty">Impossible de charger les projets : ${escapeHtml(e.message)}.</p>`;
  }
}

// ---- Suppression projet ----

function showDeleteDialog(project) {
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog delete-dialog';
  dialog.innerHTML = `
    <h2 class="fr-h6 delete-dialog__title">Supprimer le projet « ${escapeHtml(project.name)} » ?</h2>
    <div class="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w">
      <p class="fr-text--sm fr-mb-0"><strong>Cette action est définitive.</strong> Toutes les révisions de l'arborescence, de la roadmap, les commentaires et catalogues du projet seront supprimés.</p>
    </div>
    <div class="fr-input-group">
      <label class="fr-label" for="delete-confirm-input">
        Pour confirmer, tapez le nom exact du projet :
        <span class="fr-hint-text"><code>${escapeHtml(project.name)}</code></span>
      </label>
      <input class="fr-input" id="delete-confirm-input" type="text" autocomplete="off" spellcheck="false">
    </div>
    <div id="delete-error" class="fr-error-text fr-mb-2w" hidden></div>
    <div class="panel-actions delete-dialog__actions">
      <button type="button" class="fr-btn fr-btn--secondary" data-action="cancel">Annuler</button>
      <button type="button" class="fr-btn delete-dialog__confirm" data-action="confirm" disabled>
        Supprimer définitivement
      </button>
    </div>
  `;
  document.body.appendChild(dialog);

  const input = dialog.querySelector('#delete-confirm-input');
  const confirmBtn = dialog.querySelector('[data-action="confirm"]');
  const cancelBtn = dialog.querySelector('[data-action="cancel"]');
  const errorEl = dialog.querySelector('#delete-error');

  function setError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || '';
  }

  function close() {
    if (dialog.open) dialog.close();
    dialog.remove();
  }

  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value !== project.name;
    setError('');
  });

  cancelBtn.addEventListener('click', close);
  dialog.addEventListener('close', () => dialog.remove());

  confirmBtn.addEventListener('click', async () => {
    if (input.value !== project.name) return; // garde-fou
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Suppression…';
    try {
      await ensureIdentified();
      const res = await fetch(`/api/projects/${encodeURIComponent(project.slug)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`Échec : ${data.error || ('HTTP ' + res.status)}`);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Supprimer définitivement';
        return;
      }
      close();
      renderProjects();
    } catch (e) {
      setError(`Erreur réseau : ${e.message}`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Supprimer définitivement';
    }
  });

  dialog.showModal();
  setTimeout(() => input.focus(), 30);
}

// ---- Import projet ----

const importBtn = document.getElementById('import-project-btn');
const importInput = document.getElementById('import-project-input');
const importStatus = document.getElementById('import-project-status');

function setImportStatus(html, kind = '') {
  if (!importStatus) return;
  importStatus.innerHTML = html;
  importStatus.className = 'fr-mt-2w ' + (kind === 'error' ? 'fr-error-text' : kind === 'ok' ? 'fr-text--md' : '');
}

if (importBtn && importInput) {
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!file) return;
    setImportStatus(`Lecture de <code>${escapeHtml(file.name)}</code>…`);

    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch (e) {
      setImportStatus(`Fichier illisible : ${escapeHtml(e.message)}`, 'error');
      return;
    }
    if (!bundle || typeof bundle !== 'object' || !bundle.project || !bundle.project.slug) {
      setImportStatus('Format inattendu : le fichier doit contenir un objet <code>project</code> avec un <code>slug</code>.', 'error');
      return;
    }

    await ensureIdentified();
    setImportStatus('Création du projet…');
    try {
      const res = await fetch('/api/projects/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportStatus(`Échec : ${escapeHtml(data.error || ('HTTP ' + res.status))}`, 'error');
        return;
      }
      const renamed = data.slug_was_renamed
        ? ` (slug renommé en <code>${escapeHtml(data.final_slug)}</code> pour éviter le conflit)`
        : '';
      setImportStatus(`Projet importé${renamed}. <a href="/p/${encodeURIComponent(data.project.slug)}/objectifs">Ouvrir le projet →</a>`, 'ok');
      renderProjects();
    } catch (e) {
      setImportStatus(`Erreur réseau : ${escapeHtml(e.message)}`, 'error');
    }
  });
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
