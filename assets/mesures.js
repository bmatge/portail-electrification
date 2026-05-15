// Collection des 22 mesures du plan d'électrification.
// Source : mesures.json (statique). Reverse lookup vers tree.json pour les nœuds porteurs.

import { collab, ensureIdentified, escapeHtml } from './collab.js';

// Données chargées via collab.fetchData('mesures') et collab.fetchTree() — scoped projet.

const AUDIENCES = {
  particuliers:   'Particuliers',
  coproprietes:   'Copropriétés',
  collectivites:  'Collectivités',
  pros:           'Pros',
  industriels:    'Industriels',
  agriculteurs:   'Agriculteurs',
  partenaires:    'Partenaires',
  agents:         'Agents publics',
  outremer:       'Outre-mer',
};

const DEADLINES = {
  juin:       'Juin 2026',
  septembre:  'Septembre 2026',
  decembre:   'Décembre 2026',
  y2027:      '2027+',
};

const COLUMNS = ['juin', 'septembre', 'decembre', 'y2027'];

const state = {
  data: null,
  tree: null,
  nodesByMesure: new Map(),   // mesureId → [{ id, label, depth, type }]
  axe: 'all',
  audience: 'all',
  search: '',
};

const boardEl  = document.getElementById('mesures-board');
const detailEl = document.getElementById('mesure-detail');
const statsEl  = document.getElementById('mesures-stats');

// ---- Tree walking + reverse lookup ----

function* walkNodes(node, ancestors = []) {
  yield { node, ancestors };
  for (const c of node.children ?? []) yield* walkNodes(c, [...ancestors, node]);
}

function primaryType(node) {
  if (Array.isArray(node.types) && node.types.length) return node.types[0];
  return node.type || 'editorial';
}

function mesuresOf(node) {
  if (Array.isArray(node.mesures) && node.mesures.length) return node.mesures;
  if (node.mesure_plan) return [node.mesure_plan];
  return [];
}

function buildReverseLookup() {
  const map = new Map();
  let depth = 0;
  function rec(node, d) {
    for (const mId of mesuresOf(node)) {
      if (!map.has(mId)) map.set(mId, []);
      map.get(mId).push({
        id: node.id,
        label: node.label,
        type: primaryType(node),
        depth: d,
      });
    }
    for (const c of node.children ?? []) rec(c, d + 1);
  }
  rec(state.tree, 0);
  state.nodesByMesure = map;
}

// ---- Filters ----

function matchesFilters(m) {
  if (state.axe !== 'all' && m.axe !== state.axe) return false;
  if (state.audience !== 'all' && !(m.audiences || []).includes(state.audience)) return false;
  const term = state.search.trim().toLowerCase();
  if (!term) return true;
  const hay = [m.id, m.title, m.summary, m.description, m.qui, m.quand, m.objectif_chiffre].join(' ').toLowerCase();
  return hay.includes(term);
}

// ---- Render ----

function renderFilters() {
  const axeSel = document.getElementById('axe-filter');
  for (const a of state.data.meta.axes) {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.label;
    axeSel.appendChild(opt);
  }
  axeSel.addEventListener('change', () => { state.axe = axeSel.value; rerender(); });

  const audSel = document.getElementById('audience-filter');
  for (const [key, label] of Object.entries(AUDIENCES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    audSel.appendChild(opt);
  }
  audSel.addEventListener('change', () => { state.audience = audSel.value; rerender(); });

  const search = document.getElementById('search-input');
  search.addEventListener('input', () => { state.search = search.value; rerender(); });
}

function rerender() {
  renderBoard();
  renderStats();
}

function renderBoard() {
  boardEl.innerHTML = '';
  const items = state.data.mesures.filter(matchesFilters);
  if (items.length === 0) {
    boardEl.innerHTML = '<p class="panel-empty">Aucune mesure ne correspond aux filtres.</p>';
    return;
  }

  const byCol = new Map(COLUMNS.map(c => [c, []]));
  for (const m of items) {
    if (byCol.has(m.deadline)) byCol.get(m.deadline).push(m);
  }

  boardEl.style.gridTemplateColumns = `repeat(${COLUMNS.length}, 1fr)`;

  for (const col of COLUMNS) {
    const header = document.createElement('div');
    header.className = `mesures-col-header deadline-${col}`;
    header.innerHTML = `
      <span class="deadline-pill ${col}">${escapeHtml(DEADLINES[col])}</span>
      <span class="mesures-col-count">${byCol.get(col).length}</span>
    `;
    boardEl.appendChild(header);
  }

  for (const col of COLUMNS) {
    const cell = document.createElement('div');
    cell.className = `mesures-cell deadline-${col}`;
    for (const m of byCol.get(col)) cell.appendChild(buildCard(m));
    if (byCol.get(col).length === 0) {
      cell.innerHTML = '<p class="mesures-cell__empty">—</p>';
    }
    boardEl.appendChild(cell);
  }
}

function buildCard(m) {
  const axe = state.data.meta.axes.find(a => a.id === m.axe);
  const objectif = (state.data.meta.objectifs[m.axe] ?? []).find(o => o.id === m.objectif);
  const linkedNodes = state.nodesByMesure.get(m.id) || [];

  const card = document.createElement('article');
  card.className = `mesure-card mesure-card--${m.axe}`;
  card.dataset.id = m.id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Mesure ${m.id} — ${m.title}`);

  card.innerHTML = `
    <header class="mesure-card__head">
      <span class="mesure-card__id">${escapeHtml(m.id)}</span>
      <span class="mesure-card__axe">${escapeHtml(axe?.label || m.axe)}</span>
    </header>
    <h3 class="mesure-card__title">${escapeHtml(m.title)}</h3>
    <p class="mesure-card__summary">${escapeHtml(m.summary || '')}</p>
    ${objectif ? `<div class="mesure-card__crumbs">${escapeHtml(objectif.label)}</div>` : ''}
    <div class="mesure-card__audiences">
      ${(m.audiences || []).map(a => `<span class="audience-tag">${escapeHtml(AUDIENCES[a] || a)}</span>`).join('')}
    </div>
    <div class="mesure-card__nodes">
      ${linkedNodes.length === 0
        ? '<span class="mesure-card__nodes-empty">Aucun nœud du hub rattaché.</span>'
        : `<span class="mesure-card__nodes-label">Portée par :</span> ${linkedNodes.map(n =>
            `<span class="node-link-badge node-link-badge--typed type-${escapeHtml(n.type)}" title="${escapeHtml(n.id)} — niveau ${n.depth}"><span class="badge-level">L${n.depth}</span> <span class="badge-label">${escapeHtml(n.label)}</span></span>`
          ).join(' ')}`}
    </div>
  `;

  card.addEventListener('click', () => openDetail(m.id));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(m.id); }
  });
  return card;
}

function renderStats() {
  const total = state.data.mesures.length;
  const matching = state.data.mesures.filter(matchesFilters).length;
  const covered = state.data.mesures.filter(m => (state.nodesByMesure.get(m.id) || []).length > 0).length;
  statsEl.innerHTML = `
    <span class="roadmap-stat"><strong>${matching}</strong> / ${total} mesures affichées</span>
    <span class="roadmap-stat"><strong>${covered}</strong> portées par au moins un nœud du hub</span>
  `;
}

// ---- Detail panel (overlay style) ----

function openDetail(id) {
  const m = state.data.mesures.find(x => x.id === id);
  if (!m) return;
  // Use the hash so the deep-link is bookmarkable.
  history.replaceState(null, '', `#${m.id}`);
  renderDetail(m);
}

function closeDetail() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
  detailEl.hidden = true;
  detailEl.innerHTML = '';
}

function renderDetail(m) {
  const axe = state.data.meta.axes.find(a => a.id === m.axe);
  const objectif = (state.data.meta.objectifs[m.axe] ?? []).find(o => o.id === m.objectif);
  const linkedNodes = state.nodesByMesure.get(m.id) || [];

  detailEl.hidden = false;
  detailEl.innerHTML = `
    <div class="mesure-detail__backdrop"></div>
    <article class="mesure-detail__panel" role="dialog" aria-labelledby="mesure-detail-title">
      <header class="mesure-detail__head">
        <div class="mesure-detail__crumbs">
          ${escapeHtml(axe?.label || m.axe)} ${objectif ? '· ' + escapeHtml(objectif.label) : ''}
        </div>
        <button type="button" class="mesure-detail__close" aria-label="Fermer">×</button>
      </header>

      <div class="mesure-detail__meta">
        <span class="mesure-card__id">${escapeHtml(m.id)}</span>
        <span class="deadline-pill ${escapeHtml(m.deadline)}">${escapeHtml(DEADLINES[m.deadline] || m.deadline)}</span>
        ${(m.audiences || []).map(a => `<span class="audience-tag">${escapeHtml(AUDIENCES[a] || a)}</span>`).join('')}
      </div>

      <h2 id="mesure-detail-title" class="mesure-detail__title">${escapeHtml(m.title)}</h2>

      <p class="mesure-detail__description">${escapeHtml(m.description || '')}</p>

      <dl class="mesure-detail__grid">
        ${m.qui ? `<div><dt>Pour qui</dt><dd>${escapeHtml(m.qui)}</dd></div>` : ''}
        ${m.quand ? `<div><dt>Quand</dt><dd>${escapeHtml(m.quand)}</dd></div>` : ''}
        ${m.objectif_chiffre ? `<div><dt>Objectif chiffré</dt><dd>${escapeHtml(m.objectif_chiffre)}</dd></div>` : ''}
      </dl>

      <section class="mesure-detail__nodes">
        <h3 class="fr-h6">Nœuds du hub qui portent cette mesure (${linkedNodes.length})</h3>
        ${linkedNodes.length === 0
          ? '<p class="panel-empty fr-text--xs">Aucun nœud du hub n\'est encore rattaché à cette mesure. Utilisez l\'arborescence pour relier les pages concernées.</p>'
          : `<div class="mesure-detail__nodes-list">${linkedNodes.map(n =>
              `<a class="node-link-badge node-link-badge--typed type-${escapeHtml(n.type)}" href="arborescence.html?node=${encodeURIComponent(n.id)}" title="${escapeHtml(n.id)} — niveau ${n.depth} — ouvrir dans l'arborescence"><span class="badge-level">L${n.depth}</span> <span class="badge-label">${escapeHtml(n.label)}</span></a>`
            ).join(' ')}</div>`}
      </section>
    </article>
  `;

  detailEl.querySelector('.mesure-detail__close').addEventListener('click', closeDetail);
  detailEl.querySelector('.mesure-detail__backdrop').addEventListener('click', closeDetail);
  document.addEventListener('keydown', escClose);
}

function escClose(e) {
  if (e.key === 'Escape' && !detailEl.hidden) {
    document.removeEventListener('keydown', escClose);
    closeDetail();
  }
}

// ---- Identity ----

function renderIdentity() {
  const el = document.getElementById('identity-zone');
  if (!el) return;
  if (!collab.user) { el.innerHTML = ''; return; }
  el.innerHTML = '';
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
}

// ---- Boot ----

async function init() {
  await ensureIdentified();
  renderIdentity();

  try {
    const { data } = await collab.fetchData('mesures');
    state.data = data || { mesures: [] };
  } catch (e) {
    gridEl.innerHTML = `<p class="panel-empty">Impossible de charger les mesures : ${escapeHtml(e.message)}.</p>`;
    return;
  }

  try {
    const { tree } = await collab.fetchTree();
    state.tree = tree;
  } catch {
    state.tree = { id: 'root', children: [] };
  }

  buildReverseLookup();
  renderFilters();
  rerender();

  // Deep-link via #M9 dans l'URL.
  const hash = window.location.hash.replace('#', '');
  if (hash && state.data.mesures.some(m => m.id === hash)) {
    renderDetail(state.data.mesures.find(m => m.id === hash));
  }
}

init();
