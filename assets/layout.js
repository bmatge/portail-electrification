// Injects the shared header (with nav menu, project switcher) and footer.
// Each page declares its identifier via <body data-page="..."> and provides
// empty <header data-app-header> / <footer data-app-footer> placeholders.

import { collab, ensureIdentified } from './collab.js';
import { getProjectSlug, projectPath, getCurrentProject, listAllProjects } from './project.js';

const NAV_ITEMS = [
  { page: 'objectifs',        slug: 'objectifs',        label: 'Objectifs du site' },
  { page: 'arborescence',     slug: 'arborescence',     label: 'Arborescence' },
  { page: 'maquette',         slug: 'maquette',         label: 'Maquette' },
  { page: 'roadmap',          slug: 'roadmap',          label: 'Roadmap' },
  { page: 'mesures',          slug: 'mesures',          label: 'Politiques publiques' },
  { page: 'dispositifs',      slug: 'dispositifs',      label: 'Ressources & services' },
  { page: 'structure-drupal', slug: 'structure-drupal', label: 'Structure Drupal' },
];

const currentPage = document.body.dataset.page || '';
const isArborescencePage = currentPage === 'arborescence';
const slug = getProjectSlug();

function navHtml() {
  if (!slug) return '';
  return NAV_ITEMS.map(item => {
    const isCurrent = item.page === currentPage;
    const aria = isCurrent ? ' aria-current="page"' : '';
    return `<li class="fr-nav__item"><a class="fr-nav__link" href="${projectPath(item.slug)}" target="_self"${aria}>${item.label}</a></li>`;
  }).join('\n            ');
}

function renderHeader() {
  const headerEl = document.querySelector('[data-app-header]');
  if (!headerEl) return;
  headerEl.innerHTML = `
    <div class="fr-header__body">
      <div class="fr-container">
        <div class="fr-header__body-row">
          <div class="fr-header__brand fr-enlarge-link">
            <div class="fr-header__brand-top">
              <div class="fr-header__logo">
                <p class="fr-logo">République<br>Française</p>
              </div>
              <div class="fr-header__navbar">
                <button class="fr-btn--menu fr-btn" data-fr-opened="false" aria-controls="modal-header" aria-haspopup="menu" id="button-menu" title="Menu">Menu</button>
              </div>
            </div>
            <div class="fr-header__service">
              <a href="/" title="Accueil — Sélection de projet">
                <p class="fr-header__service-title">L'atelier 🪢</p>
              </a>
              <p class="fr-header__service-tagline" id="project-tagline">${slug ? '…' : 'Aucun projet sélectionné'}</p>
            </div>
          </div>
          <div class="fr-header__tools">
            <div class="fr-header__tools-links">
              <div id="project-switcher" class="project-switcher"></div>
              <div id="identity-zone" class="identity-zone"></div>
              <ul class="fr-btns-group">
                <li>
                  <a class="fr-btn fr-icon-github-fill" href="https://github.com/bmatge/latelier-cadrage-site" target="_blank" rel="noopener">Code source</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="fr-header__menu fr-modal" id="modal-header" aria-labelledby="button-menu">
      <div class="fr-container">
        <button class="fr-btn--close fr-btn" aria-controls="modal-header" title="Fermer">Fermer</button>
        <div class="fr-header__menu-links"></div>
        <nav class="fr-nav" id="navigation" role="navigation" aria-label="Menu principal">
          <ul class="fr-nav__list">
            ${navHtml()}
          </ul>
        </nav>
      </div>
    </div>
  `;
}

function renderFooter() {
  const footerEl = document.querySelector('[data-app-footer]');
  if (!footerEl) return;
  footerEl.innerHTML = `
    <div class="fr-container">
      <div class="fr-footer__body">
        <div class="fr-footer__brand fr-enlarge-link">
          <p class="fr-logo">République<br>Française</p>
        </div>
        <div class="fr-footer__content">
          <p class="fr-footer__content-desc">L'atelier — cadrage de sites institutionnels : arborescence, maquette, roadmap, ressources et politiques publiques, par projet.</p>
          <ul class="fr-footer__content-list">
            <li class="fr-footer__content-item"><a class="fr-footer__content-link" href="/" target="_self">Liste des projets</a></li>
            <li class="fr-footer__content-item"><a class="fr-footer__content-link" href="https://www.systeme-de-design.gouv.fr" target="_blank" rel="noopener">Système de design</a></li>
          </ul>
        </div>
      </div>
      <div class="fr-footer__bottom">
        <ul class="fr-footer__bottom-list">
          <li class="fr-footer__bottom-item"><a class="fr-footer__bottom-link" href="https://github.com/bmatge/latelier-cadrage-site" target="_blank" rel="noopener">Code source</a></li>
          <li class="fr-footer__bottom-item"><a class="fr-footer__bottom-link" href="https://github.com/bmatge/latelier-cadrage-site/issues" target="_blank" rel="noopener">Signaler un problème</a></li>
        </ul>
        <div class="fr-footer__bottom-copy">
          <p>Sauf mention contraire, code sous licence MIT. Données ouvertes — aucune donnée personnelle collectée.</p>
        </div>
      </div>
    </div>
  `;
}

function renderIdentity() {
  const el = document.getElementById('identity-zone');
  if (!el) return;
  el.innerHTML = '';

  if (collab.user) {
    const span = document.createElement('span');
    span.className = 'identity-name';
    span.textContent = collab.user.name;
    const change = document.createElement('button');
    change.type = 'button';
    change.className = 'fr-btn fr-btn--tertiary fr-btn--sm';
    change.textContent = 'Changer';
    change.addEventListener('click', async () => {
      await collab.logout();
      await ensureIdentified();
      renderIdentity();
    });
    el.append('Identifié comme ', span, ' ', change);
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-account-line fr-btn--icon-left';
    btn.textContent = "S'identifier";
    btn.addEventListener('click', async () => {
      await ensureIdentified();
      renderIdentity();
    });
    el.appendChild(btn);
  }
}

async function renderProjectContext() {
  if (!slug) return;
  // Tagline = nom du projet courant
  try {
    const project = await getCurrentProject();
    const tagline = document.getElementById('project-tagline');
    if (tagline && project) tagline.textContent = `Projet : ${project.name}`;
  } catch { /* non-fatal */ }

  // Switcher = liste tous les projets dans un select
  const sw = document.getElementById('project-switcher');
  if (!sw) return;
  try {
    const projects = await listAllProjects();
    if (projects.length <= 1) return; // pas la peine d'afficher un switcher
    const select = document.createElement('select');
    select.className = 'fr-select fr-select--sm project-switcher__select';
    select.setAttribute('aria-label', 'Changer de projet');
    for (const p of projects) {
      const opt = document.createElement('option');
      opt.value = p.slug;
      opt.textContent = p.name;
      if (p.slug === slug) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      const next = select.value;
      if (next && next !== slug) {
        // Garde la même page si possible
        window.location.href = `/p/${encodeURIComponent(next)}/${currentPage}`;
      }
    });
    sw.appendChild(select);
  } catch { /* non-fatal */ }
}

async function initIdentity() {
  if (isArborescencePage) return;
  try {
    await collab.me();
  } catch { /* offline / server unreachable: render unidentified state */ }
  renderIdentity();
}

renderHeader();
renderFooter();
initIdentity();
renderProjectContext();
