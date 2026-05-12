// Injects the shared header (with nav menu) and footer into every page.
// Each page declares its identifier via <body data-page="..."> and provides
// empty <header data-app-header> / <footer data-app-footer> placeholders.
//
// Order matters: this script must run before DSFR initialises the header
// components (it is loaded as a non-async module in <head>/early <body>, so
// it executes after DOM parse but before deferred DSFR scripts).

import { collab, ensureIdentified } from './collab.js';

const NAV_ITEMS = [
  { page: 'objectifs',    href: './',                label: 'Objectifs du site' },
  { page: 'arborescence', href: 'arborescence.html', label: 'Arborescence' },
  { page: 'roadmap',      href: 'roadmap.html',      label: 'Roadmap' },
  { page: 'mesures',      href: 'mesures.html',      label: 'Mesures du plan' },
  { page: 'dispositifs',  href: 'dispositifs.html',  label: 'Dispositifs existants' },
  { page: 'decision',     href: 'decision.html',     label: 'Arbre de décision' },
];

const currentPage = document.body.dataset.page || '';
const isArborescencePage = currentPage === 'arborescence';

function navHtml() {
  return NAV_ITEMS.map(item => {
    const isCurrent = item.page === currentPage;
    const aria = isCurrent ? ' aria-current="page"' : '';
    return `<li class="fr-nav__item"><a class="fr-nav__link" href="${item.href}" target="_self"${aria}>${item.label}</a></li>`;
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
              <a href="./" title="Accueil — Hub d'info plan d'électrification">
                <p class="fr-header__service-title">Hub d'info — Plan d'électrification</p>
              </a>
              <p class="fr-header__service-tagline">Prototype de cadrage</p>
            </div>
          </div>
          <div class="fr-header__tools">
            <div class="fr-header__tools-links">
              <div id="identity-zone" class="identity-zone"></div>
              <ul class="fr-btns-group">
                <li>
                  <a class="fr-btn fr-icon-github-fill" href="https://github.com/bmatge/portail-electrification" target="_blank" rel="noopener">Code source</a>
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
          <p class="fr-footer__content-desc">Prototype de cadrage du volet numérique du plan d'électrification.</p>
          <ul class="fr-footer__content-list">
            <li class="fr-footer__content-item"><a class="fr-footer__content-link" href="https://www.economie.gouv.fr" target="_blank" rel="noopener">economie.gouv.fr</a></li>
            <li class="fr-footer__content-item"><a class="fr-footer__content-link" href="https://www.ecologie.gouv.fr" target="_blank" rel="noopener">ecologie.gouv.fr</a></li>
            <li class="fr-footer__content-item"><a class="fr-footer__content-link" href="https://www.systeme-de-design.gouv.fr" target="_blank" rel="noopener">Système de design</a></li>
          </ul>
        </div>
      </div>
      <div class="fr-footer__bottom">
        <ul class="fr-footer__bottom-list">
          <li class="fr-footer__bottom-item"><a class="fr-footer__bottom-link" href="https://github.com/bmatge/portail-electrification" target="_blank" rel="noopener">Code source</a></li>
          <li class="fr-footer__bottom-item"><a class="fr-footer__bottom-link" href="https://github.com/bmatge/portail-electrification/issues" target="_blank" rel="noopener">Signaler un problème</a></li>
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

async function initIdentity() {
  // The arborescence page runs its own ensureIdentified()/renderIdentity()
  // lifecycle inside script.js. Skip here to avoid double prompts.
  if (isArborescencePage) return;
  try {
    await collab.me();
  } catch { /* offline / server unreachable: render unidentified state */ }
  renderIdentity();
}

renderHeader();
renderFooter();
initIdentity();
