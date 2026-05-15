// Roadmap dérivée du tree : 4 colonnes (échéances) × N lignes (types de page OU publics).
// Pas de persistance dédiée : la source de vérité est l'arborescence.

import { collab, ensureIdentified, escapeHtml } from './collab.js';
import { TYPES, AUDIENCES, DEADLINES as COLUMN_LABELS, DEADLINE_ORDER as COLUMNS } from './vocab.js';

// Tree chargé via collab.fetchTree() — scoped projet.

const state = {
  tree: null,
  mode: 'types',       // 'types' | 'audiences'
  search: '',
  saveStatus: 'idle',  // 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
  saveMessage: '',
};

const boardEl = document.getElementById('roadmap-board');
const statsEl = document.getElementById('roadmap-stats');

// ---- Save (queued, single-flight) ----

let inFlight = false;
let pendingSave = null;     // most recent message awaiting flush

async function persistTree(message) {
  pendingSave = message;
  if (inFlight) return;
  inFlight = true;
  while (pendingSave !== null) {
    const msg = pendingSave;
    pendingSave = null;
    state.saveStatus = 'saving';
    renderSaveStatus();
    try {
      await collab.saveTree(state.tree, msg);
      state.saveStatus = 'saved';
      state.saveMessage = '';
    } catch (e) {
      if (e.status === 409) {
        state.saveStatus = 'conflict';
        state.saveMessage = `Conflit (révision #${e.data?.head?.id}). Rechargez la page.`;
      } else if (e.status === 401) {
        state.saveStatus = 'error';
        state.saveMessage = 'Identification expirée.';
        await ensureIdentified();
      } else {
        state.saveStatus = 'error';
        state.saveMessage = e.message || 'Erreur de sauvegarde';
      }
    }
    renderSaveStatus();
  }
  inFlight = false;
}

function renderSaveStatus() {
  const el = document.getElementById('save-status');
  if (!el) return;
  const map = {
    idle:    '',
    saving:  'Enregistrement…',
    saved:   `Enregistré · révision #${collab.currentRevisionId ?? '?'}`,
    error:   `Erreur : ${state.saveMessage}`,
    conflict:`Conflit — ${state.saveMessage}`,
  };
  el.textContent = map[state.saveStatus] ?? '';
  el.className = `save-status save-status--${state.saveStatus}`;
}

// ---- Tree walking helpers ----

function* walkNodes(node, ancestors = []) {
  yield { node, ancestors };
  for (const c of node.children ?? []) yield* walkNodes(c, [...ancestors, node]);
}

function typesOf(node) {
  if (Array.isArray(node.types) && node.types.length) return node.types;
  return node.type ? [node.type] : [];
}

function audiencesOf(node, ancestors) {
  if (Array.isArray(node.audiences) && node.audiences.length) return node.audiences;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i].audiences;
    if (Array.isArray(a) && a.length) return a;
  }
  return [];
}

function deadlineOf(node) {
  return node.deadline || '';
}

// ---- Filtering ----

function matchesSearch(text) {
  const term = state.search.trim().toLowerCase();
  if (!term) return true;
  return text.toLowerCase().includes(term);
}

function cardMatchesSearch(card) {
  if (!state.search.trim()) return true;
  const haystack = [
    card.node.label,
    card.node.tldr || '',
    card.improvement?.title || '',
    card.improvement?.description || '',
  ].join(' ');
  return matchesSearch(haystack);
}

// ---- Build grid ----

function buildGrid() {
  // grid.get(rowKey).get(colKey) → Array<{ kind, node, improvement? }>
  const rowMap = state.mode === 'types' ? TYPES : AUDIENCES;
  const rowKeys = Object.keys(rowMap);
  const grid = new Map();
  for (const r of rowKeys) grid.set(r, new Map(COLUMNS.map(c => [c, []])));

  for (const { node, ancestors } of walkNodes(state.tree)) {
    if (node.id === state.tree.id) continue; // skip root hub
    const rows = state.mode === 'types' ? typesOf(node) : audiencesOf(node, ancestors);
    if (rows.length === 0) continue;

    const dl = deadlineOf(node);
    if (COLUMNS.includes(dl)) {
      for (const rk of rows) {
        if (grid.has(rk)) grid.get(rk).get(dl).push({ kind: 'node', node });
      }
    }

    for (const imp of node.improvements ?? []) {
      if (!COLUMNS.includes(imp.deadline)) continue;
      for (const rk of rows) {
        if (grid.has(rk)) grid.get(rk).get(imp.deadline).push({ kind: 'improvement', node, improvement: imp });
      }
    }
  }
  return grid;
}

// ---- Render ----

function renderStats() {
  const grid = buildGrid();
  let totalNodes = 0, totalImps = 0;
  const byCol = Object.fromEntries(COLUMNS.map(c => [c, 0]));
  for (const colMap of grid.values()) {
    for (const [col, items] of colMap) {
      for (const it of items) {
        if (!cardMatchesSearch(it)) continue;
        if (it.kind === 'node') totalNodes++;
        else totalImps++;
        byCol[col]++;
      }
    }
  }
  const cols = COLUMNS
    .map(c => `<span class="roadmap-stat"><strong>${byCol[c]}</strong> ${escapeHtml(COLUMN_LABELS[c])}</span>`)
    .join('');
  statsEl.innerHTML = `
    <span class="roadmap-stat"><strong>${totalNodes}</strong> nœuds</span>
    <span class="roadmap-stat"><strong>${totalImps}</strong> améliorations</span>
    ${cols}
  `;
}

function renderBoard() {
  boardEl.innerHTML = '';
  const grid = buildGrid();
  const rowMap = state.mode === 'types' ? TYPES : AUDIENCES;

  // Only render rows that contain at least one filtered card; collapse empty rows.
  const rowKeys = [...grid.keys()].filter(rk => {
    for (const items of grid.get(rk).values()) {
      if (items.some(cardMatchesSearch)) return true;
    }
    return false;
  });

  if (rowKeys.length === 0) {
    boardEl.innerHTML = '<p class="panel-empty">Aucune ligne à afficher — ajoutez une échéance et un type (ou public) sur les nœuds depuis l\'arborescence, ou affinez votre recherche.</p>';
    return;
  }

  boardEl.style.gridTemplateColumns = `180px repeat(${COLUMNS.length}, 1fr)`;

  // Top-left empty cell
  const corner = document.createElement('div');
  corner.className = 'roadmap-corner';
  boardEl.appendChild(corner);

  // Column headers (deadlines)
  for (const col of COLUMNS) {
    const h = document.createElement('div');
    h.className = `roadmap-col-header deadline-${col}`;
    h.innerHTML = `
      <span class="deadline-pill ${col}">${escapeHtml(COLUMN_LABELS[col])}</span>
    `;
    boardEl.appendChild(h);
  }

  // One row per type or audience that has at least one card
  for (const rk of rowKeys) {
    const rowHeader = document.createElement('div');
    rowHeader.className = `roadmap-row-header roadmap-row-header--${state.mode}`;
    const label = rowMap[rk]?.label ?? rowMap[rk] ?? rk;
    rowHeader.innerHTML = `<strong>${escapeHtml(label)}</strong>`;
    if (state.mode === 'types') {
      rowHeader.classList.add(`type-${rk}`);
    }
    boardEl.appendChild(rowHeader);

    for (const col of COLUMNS) {
      const cell = document.createElement('div');
      cell.className = `roadmap-cell deadline-${col}`;
      cell.dataset.row = rk;
      cell.dataset.col = col;
      attachDropZone(cell, col);

      const items = grid.get(rk).get(col);
      for (const it of items) {
        if (!cardMatchesSearch(it)) continue;
        cell.appendChild(buildCard(it));
      }
      boardEl.appendChild(cell);
    }
  }
}

function attachDropZone(cell, col) {
  cell.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('application/x-roadmap-card')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    cell.classList.add('roadmap-cell--drop-target');
  });
  cell.addEventListener('dragleave', () => {
    cell.classList.remove('roadmap-cell--drop-target');
  });
  cell.addEventListener('drop', async (e) => {
    cell.classList.remove('roadmap-cell--drop-target');
    const raw = e.dataTransfer.getData('application/x-roadmap-card');
    if (!raw) return;
    e.preventDefault();
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    if (payload.fromCol === col) return; // same column = no-op

    const node = findNode(state.tree, payload.nodeId);
    if (!node) return;

    if (payload.kind === 'node') {
      node.deadline = col;
      renderBoard();
      renderStats();
      await persistTree(`Échéance de ${node.id} → ${col}`);
    } else if (payload.kind === 'improvement') {
      const imp = (node.improvements ?? []).find(i => i.id === payload.improvementId);
      if (!imp) return;
      imp.deadline = col;
      renderBoard();
      renderStats();
      await persistTree(`Échéance amélioration ${imp.id} → ${col}`);
    }
  });
}

function findNode(root, id) {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const r = findNode(c, id);
    if (r) return r;
  }
  return null;
}

function buildCard(item) {
  if (item.kind === 'node') return buildNodeCard(item.node);
  return buildImprovementCard(item.node, item.improvement);
}

function buildNodeCard(node) {
  const card = document.createElement('article');
  card.className = 'roadmap-card roadmap-card--node';
  card.dataset.nodeId = node.id;

  setupDrag(card, { kind: 'node', nodeId: node.id, fromCol: node.deadline || '' });

  const body = document.createElement('div');
  body.className = 'roadmap-card__body';

  const title = document.createElement('div');
  title.className = 'roadmap-card__title';
  title.textContent = node.label;
  body.appendChild(title);

  if (node.tldr) {
    const desc = document.createElement('p');
    desc.className = 'roadmap-card__desc';
    desc.textContent = node.tldr;
    body.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'roadmap-card__meta';
  meta.innerHTML = `<span class="roadmap-card__id">${escapeHtml(node.id)}</span>`;
  body.appendChild(meta);

  card.appendChild(body);
  card.appendChild(buildOpenButton(node.id));
  return card;
}

function buildImprovementCard(node, imp) {
  const card = document.createElement('article');
  card.className = 'roadmap-card roadmap-card--improvement';
  card.dataset.nodeId = node.id;
  card.dataset.improvementId = imp.id;

  setupDrag(card, { kind: 'improvement', nodeId: node.id, improvementId: imp.id, fromCol: imp.deadline || '' });

  const body = document.createElement('div');
  body.className = 'roadmap-card__body';

  const parent = document.createElement('div');
  parent.className = 'roadmap-card__parent';
  parent.textContent = node.label;
  body.appendChild(parent);

  const title = document.createElement('div');
  title.className = 'roadmap-card__title';
  title.textContent = imp.title || '(amélioration sans titre)';
  body.appendChild(title);

  if (imp.description) {
    const desc = document.createElement('p');
    desc.className = 'roadmap-card__desc';
    desc.textContent = imp.description;
    body.appendChild(desc);
  }

  card.appendChild(body);
  card.appendChild(buildOpenButton(node.id));
  return card;
}

function setupDrag(card, payload) {
  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-roadmap-card', JSON.stringify(payload));
    // Plain-text fallback (e.g. dragging into a text editor).
    e.dataTransfer.setData('text/plain', payload.nodeId);
    card.classList.add('roadmap-card--dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('roadmap-card--dragging');
    document.querySelectorAll('.roadmap-cell--drop-target').forEach(c => c.classList.remove('roadmap-cell--drop-target'));
  });
}

function buildOpenButton(nodeId) {
  const a = document.createElement('a');
  a.href = `arborescence.html?node=${encodeURIComponent(nodeId)}`;
  a.className = 'roadmap-card__open';
  a.title = 'Ouvrir dans l\'arborescence';
  a.setAttribute('aria-label', 'Ouvrir dans l\'arborescence');
  a.innerHTML = '↗';
  // Stop the click from bubbling to anything draggable.
  a.addEventListener('click', (e) => e.stopPropagation());
  // Prevent the link from initiating a drag of itself.
  a.draggable = false;
  return a;
}

// ---- Identity (read-only, just for "Identifié comme") ----

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

// ---- Toolbar wiring (mode switch + search) ----

document.querySelectorAll('.roadmap-mode__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.roadmap-mode__btn').forEach(b => b.classList.remove('roadmap-mode__btn--on'));
    btn.classList.add('roadmap-mode__btn--on');
    state.mode = btn.dataset.mode;
    renderBoard();
    renderStats();
  });
});

document.getElementById('search-input').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderBoard();
  renderStats();
});

// ---- Boot ----

async function init() {
  await ensureIdentified();
  renderIdentity();

  try {
    const { tree } = await collab.fetchTree();
    state.tree = tree;
  } catch (e) {
    boardEl.innerHTML = `<p class="panel-empty">Impossible de charger l'arborescence : ${e.message}.</p>`;
    return;
  }

  renderBoard();
  renderStats();
}

init();
