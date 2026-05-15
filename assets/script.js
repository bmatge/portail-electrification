// Tree editor for the hub d'info arborescence. Persisted server-side via /api.

import { collab, ensureIdentified, escapeHtml, formatDate, renderDiff } from './collab.js';

const COLLAPSED_KEY = 'latelier.collapsed.v1';
const COLLAPSED_KEY_LEGACY = 'portail-electrification.collapsed.v1';

const TYPES = {
  hub:         { label: 'Hub' },
  editorial:   { label: 'Éditorial' },
  service:     { label: 'Service' },
  simulator:   { label: 'Simulateur' },
  map:         { label: 'Carte' },
  external:    { label: 'Renvoi externe' },
  marketplace: { label: 'Marketplace' },
  kit:         { label: 'Kit' },
  form:        { label: 'Formulaire' },
  private:     { label: 'Espace privé' },
};

const DEADLINES = {
  juin:       'Juin 2026',
  septembre:  'Septembre 2026',
  decembre:   'Décembre 2026',
  y2027:      '2027+',
};

const DEADLINE_ORDER = ['juin', 'septembre', 'decembre', 'y2027'];

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

const DEFAULT_TREE_URL = 'assets/data/tree.json';

// Set in init() once the JSON has been fetched. Used as fallback when no
// localStorage data exists yet, and as the source for the "Réinitialiser" action.
let defaultTree = null;

// ---- State ----

const state = {
  tree: null,
  selectedId: 'root',
  collapsed: loadCollapsed(),
  search: '',
  deadline: 'all',
  commentCounts: {},
  saveStatus: 'idle', // 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
  saveMessage: '',
  // Tracks which panel-accordion sections (by id: 'config' | 'dispositifs' | 'objectives')
  // the user has opened, so re-renders of the panel don't snap them shut.
  openAccordions: new Set(),
};

function bindAccordion(details, id) {
  if (state.openAccordions.has(id)) details.open = true;
  details.addEventListener('toggle', () => {
    if (details.open) state.openAccordions.add(id);
    else state.openAccordions.delete(id);
  });
}

let saveTimer = null;
let inFlight = false;
let pendingSave = false;
let pendingMessage = '';

function save(message = '') {
  // Debounced save to server. Multiple rapid edits coalesce into one PUT.
  if (message) pendingMessage = message;
  if (saveTimer) clearTimeout(saveTimer);
  state.saveStatus = 'saving';
  renderStatus();
  saveTimer = setTimeout(flushSave, 600);
}

async function flushSave() {
  if (inFlight) { pendingSave = true; return; }
  inFlight = true;
  pendingSave = false;
  const msg = pendingMessage;
  pendingMessage = '';
  try {
    await collab.saveTree(state.tree, msg);
    state.saveStatus = 'saved';
    state.saveMessage = '';
  } catch (e) {
    if (e.status === 409) {
      state.saveStatus = 'conflict';
      state.saveMessage = `Une autre personne a modifié l'arbre (révision #${e.data?.head?.id}).`;
    } else if (e.status === 401) {
      state.saveStatus = 'error';
      state.saveMessage = 'Identification expirée.';
      await ensureIdentified();
      pendingSave = true;
    } else {
      state.saveStatus = 'error';
      state.saveMessage = e.message || 'Erreur de sauvegarde';
    }
  } finally {
    inFlight = false;
    renderStatus();
    if (pendingSave) flushSave();
  }
}

function loadCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY) ?? localStorage.getItem(COLLAPSED_KEY_LEGACY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveCollapsed() {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...state.collapsed]));
}

// ---- Tree helpers ----

function* walk(node, parent = null, depth = 0) {
  yield { node, parent, depth };
  for (const child of node.children ?? []) yield* walk(child, node, depth + 1);
}

function find(id, root = state.tree) {
  for (const { node, parent } of walk(root)) {
    if (node.id === id) return { node, parent };
  }
  return null;
}

function newId() {
  return 'n' + Math.random().toString(36).slice(2, 8);
}

function makeNode(label = 'Nouveau nœud') {
  return {
    id: newId(),
    label,
    types: ['editorial'],
    format: '',
    tldr: '',
    url: '',
    deadline: 'y2027',
    time_tech: null,
    time_edito: null,
    auth: false,
    mesures: [],
    audiences: [],
    dispositifs: [],
    blocks: [],
    improvements: [],
    children: [],
  };
}

function newBlockId() {
  return 'b' + Math.random().toString(36).slice(2, 8);
}

function makeBlock() {
  return { id: newBlockId(), title: '', description: '' };
}

function newImprovementId() {
  return 'i' + Math.random().toString(36).slice(2, 8);
}

function makeImprovement() {
  return { id: newImprovementId(), deadline: '', title: '', description: '' };
}

function primaryType(node) {
  return (node.types && node.types[0]) || node.type || 'editorial';
}

const OLD_PRIORITY_TO_DEADLINE = { mvp: 'juin', v1: 'septembre', v2: 'decembre', v3: 'y2027' };

function normalizeNode(node) {
  // Backfills missing fields so historical revisions (with priority/complexity/audience/type)
  // remain readable without crashing the UI. Does not save; just mutates in-memory.
  if (typeof node.deadline === 'undefined') {
    node.deadline = node.priority ? (OLD_PRIORITY_TO_DEADLINE[node.priority] ?? '') : '';
  }
  if (typeof node.time_tech === 'undefined') node.time_tech = null;
  if (typeof node.time_edito === 'undefined') node.time_edito = null;
  if (!Array.isArray(node.types)) {
    node.types = node.type ? [node.type] : ['editorial'];
  }
  if (!Array.isArray(node.audiences)) {
    node.audiences = node.audience ? [node.audience] : [];
  }
  if (!Array.isArray(node.blocks)) node.blocks = [];
  else for (const b of node.blocks) { if (!b.id) b.id = newBlockId(); }
  if (!Array.isArray(node.improvements)) node.improvements = [];
  else for (const imp of node.improvements) { if (!imp.id) imp.id = newImprovementId(); }
  if (!Array.isArray(node.mesures)) {
    node.mesures = node.mesure_plan ? [node.mesure_plan] : [];
  }
  if (!Array.isArray(node.dispositifs)) node.dispositifs = [];
  if (!Array.isArray(node.children)) node.children = [];
  // Legacy fields (priority, complexity, audience, type) are left untouched but never written.
  for (const c of node.children) normalizeNode(c);
}

function parentOf(id) {
  for (const { node, parent } of walk(state.tree)) {
    if (node.id === id) return parent;
  }
  return null;
}

function ancestorOf(targetId, candidateId) {
  // True if candidateId is an ancestor of targetId in state.tree.
  const found = find(candidateId);
  if (!found) return false;
  for (const { node } of walk(found.node)) {
    if (node.id === targetId) return true;
  }
  return false;
}

function audiencesFor(node) {
  // Use explicit audiences if any, else inherit from the closest ancestor that has some.
  if (node.audiences && node.audiences.length) return node.audiences;
  function findPath(root, targetId, acc) {
    if (root.id === targetId) return acc;
    for (const c of root.children ?? []) {
      const r = findPath(c, targetId, [...acc, root]);
      if (r) return r;
    }
    return null;
  }
  const ancestors = findPath(state.tree, node.id, []) ?? [];
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].audiences && ancestors[i].audiences.length) return ancestors[i].audiences;
  }
  return [];
}

// ---- Rendering ----

const treeEl = document.getElementById('tree');
const panelEl = document.getElementById('panel');
const legendEl = document.getElementById('legend');
const counterEl = document.getElementById('counter');

function matchesFilters(node) {
  const term = state.search.trim().toLowerCase();
  const labelMatch = !term || node.label.toLowerCase().includes(term) || (node.tldr || '').toLowerCase().includes(term);
  return labelMatch && matchesDeadline(node);
}

function matchesDeadline(node) {
  if (state.deadline === 'all') return true;
  if (state.deadline === 'none') return !node.deadline;
  return node.deadline === state.deadline;
}

function subtreeMatches(node) {
  if (matchesFilters(node)) return true;
  return (node.children ?? []).some(subtreeMatches);
}

function renderTree() {
  treeEl.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'flat-list';

  function rec(node, parents) {
    const row = renderNodeRow(node, parents);
    if (!subtreeMatches(node)) row.classList.add('dim');
    list.appendChild(row);
    if (state.collapsed.has(node.id)) return;
    for (const c of node.children ?? []) rec(c, [...parents, node]);
  }
  rec(state.tree, []);

  treeEl.appendChild(list);
  renderLegend();
  renderCounter();
}

function renderNodeRow(node, parents) {
  const depth = parents.length;
  const row = document.createElement('div');
  row.className = 'flat-row';
  row.dataset.id = node.id;
  row.dataset.depth = String(depth);
  row.style.setProperty('--depth', String(depth));
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-level', String(depth + 1));
  if (node.id === state.selectedId) row.classList.add('selected');

  // Drag handle: drag any row except root.
  if (node.id !== state.tree.id) {
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('.flat-row').forEach(r => r.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-child'));
    });
  }
  row.addEventListener('dragover', (e) => {
    if (!isDragValid(e, node)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const yMid = rect.top + rect.height / 2;
    row.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-child');
    // Three zones: top 25% = before, middle 50% = child, bottom 25% = after
    const offset = e.clientY - rect.top;
    if (offset < rect.height * 0.25) row.classList.add('drag-over-before');
    else if (offset > rect.height * 0.75) row.classList.add('drag-over-after');
    else row.classList.add('drag-over-child');
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-child');
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    let mode = 'after';
    if (row.classList.contains('drag-over-before')) mode = 'before';
    else if (row.classList.contains('drag-over-child')) mode = 'child';
    row.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-child');
    performMove(sourceId, node.id, mode);
  });

  // Column 1: toggle (chevron for nodes with children, placeholder otherwise)
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'flat-row__toggle';
  const hasChildren = (node.children ?? []).length > 0;
  if (hasChildren) {
    const isCollapsed = state.collapsed.has(node.id);
    toggle.textContent = isCollapsed ? '▸' : '▾';
    toggle.setAttribute('aria-label', isCollapsed ? `Déplier ${node.label}` : `Replier ${node.label}`);
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.collapsed.has(node.id)) state.collapsed.delete(node.id);
      else state.collapsed.add(node.id);
      saveCollapsed();
      renderTree();
    });
  } else {
    toggle.classList.add('flat-row__toggle--placeholder');
    toggle.tabIndex = -1;
    toggle.setAttribute('aria-hidden', 'true');
  }
  row.appendChild(toggle);

  // Column 2: audiences (multi, inherited from ancestors if empty)
  const aud = document.createElement('div');
  aud.className = 'flat-row__audience';
  const inherited = !(node.audiences && node.audiences.length);
  for (const key of audiencesFor(node)) {
    const tag = document.createElement('span');
    tag.className = 'audience-tag' + (inherited ? ' audience-tag--inherited' : '');
    tag.textContent = AUDIENCES[key] ?? key;
    aud.appendChild(tag);
  }
  row.appendChild(aud);

  // Column 3: label (no TL;DR, no breadcrumb — depth is shown by physical indent)
  const text = document.createElement('div');
  text.className = 'flat-row__text';
  const lbl = document.createElement('span');
  lbl.className = 'flat-row__label';
  lbl.textContent = node.label;
  text.appendChild(lbl);
  row.appendChild(text);

  // Column 4: deadline pill + blocks counter + comments if any
  const tags = document.createElement('div');
  tags.className = 'flat-row__tags';
  if (node.deadline) {
    const pri = document.createElement('span');
    pri.className = `deadline-pill ${node.deadline}`;
    pri.textContent = DEADLINES[node.deadline] ?? node.deadline;
    tags.appendChild(pri);
  }
  const blockN = (node.blocks ?? []).length;
  if (blockN > 0) {
    const b = document.createElement('span');
    b.className = 'blocks-pill';
    b.textContent = `▦ ${blockN}`;
    b.title = `${blockN} bloc${blockN > 1 ? 's' : ''} de contenu`;
    tags.appendChild(b);
  }
  const commentN = state.commentCounts[node.id] || 0;
  if (commentN > 0) {
    const c = document.createElement('span');
    c.className = 'comment-pill';
    c.textContent = `💬 ${commentN}`;
    c.title = `${commentN} commentaire${commentN > 1 ? 's' : ''}`;
    tags.appendChild(c);
  }
  row.appendChild(tags);

  row.addEventListener('click', () => {
    state.selectedId = node.id;
    renderTree();
    renderPanel();
  });

  return row;
}

// Drag&drop helpers

function isDragValid(e, targetNode) {
  const sourceId = e.dataTransfer.types.includes('text/plain') ? null : null; // we don't have access to data during dragover in some browsers
  // Just always allow dragover; we validate on drop.
  return true;
}

function performMove(sourceId, targetId, mode) {
  if (!sourceId || sourceId === targetId) return;
  // Can't drop into itself or its descendants.
  if (ancestorOf(targetId, sourceId)) {
    alert('Impossible de déplacer un nœud dans sa propre descendance.');
    return;
  }
  if (sourceId === state.tree.id) return; // can't move root

  const srcInfo = find(sourceId);
  const tgtInfo = find(targetId);
  if (!srcInfo || !tgtInfo) return;

  // Detach source
  const srcParent = srcInfo.parent;
  if (!srcParent) return; // root, can't move
  srcParent.children = srcParent.children.filter(c => c.id !== sourceId);

  if (mode === 'child') {
    // Insert as first child of target
    if (!tgtInfo.node.children) tgtInfo.node.children = [];
    tgtInfo.node.children.unshift(srcInfo.node);
  } else {
    // Insert as sibling of target (before or after)
    const tgtParent = tgtInfo.parent;
    if (!tgtParent) {
      // Target is root; fall back to insert as first child of root
      state.tree.children.unshift(srcInfo.node);
    } else {
      const idx = tgtParent.children.indexOf(tgtInfo.node);
      const insertAt = mode === 'before' ? idx : idx + 1;
      tgtParent.children.splice(insertAt, 0, srcInfo.node);
    }
  }

  save(`Déplacement de ${sourceId} (${mode}) vers ${targetId}`);
  state.selectedId = sourceId;
  renderTree(); renderPanel();
}

function promoteNode(node) {
  // Move node up one level: becomes sibling of its current parent.
  const found = find(node.id);
  if (!found || !found.parent) return;
  const parent = found.parent;
  const grandFound = find(parent.id);
  if (!grandFound || !grandFound.parent) {
    alert('Ce nœud est déjà au plus haut niveau possible.');
    return;
  }
  const grandparent = grandFound.parent;
  parent.children = parent.children.filter(c => c.id !== node.id);
  const idx = grandparent.children.indexOf(parent);
  grandparent.children.splice(idx + 1, 0, node);
  save(`Promotion d'un niveau : ${node.id}`);
  renderTree(); renderPanel();
}

function demoteNode(node) {
  // Move node down one level: becomes last child of its previous sibling.
  const found = find(node.id);
  if (!found || !found.parent) return;
  const parent = found.parent;
  const idx = parent.children.indexOf(node);
  if (idx <= 0) {
    alert('Aucun frère précédent — il faut un nœud frère avant celui-ci pour le faire descendre d\'un niveau.');
    return;
  }
  const prevSibling = parent.children[idx - 1];
  parent.children.splice(idx, 1);
  if (!prevSibling.children) prevSibling.children = [];
  prevSibling.children.push(node);
  save(`Descente d'un niveau : ${node.id}`);
  renderTree(); renderPanel();
}

function renderLegend() {
  legendEl.innerHTML = '';
  for (const [key, def] of Object.entries(TYPES)) {
    const pill = document.createElement('span');
    pill.className = `type-pill type-${key}`;
    pill.textContent = def.label;
    legendEl.appendChild(pill);
  }
}

function renderCounter() {
  let total = 0, maxDepth = 0;
  for (const { depth } of walk(state.tree)) {
    total++;
    if (depth > maxDepth) maxDepth = depth;
  }
  counterEl.textContent = `${total} nœud${total > 1 ? 's' : ''} — profondeur max ${maxDepth + 1} niveau${maxDepth ? 'x' : ''}.`;
}

function renderPanel() {
  const found = find(state.selectedId);
  if (!found) {
    panelEl.innerHTML = '<p class="panel-empty">Sélectionnez un nœud dans l\'arborescence.</p>';
    return;
  }
  const { node, parent } = found;
  panelEl.innerHTML = '';

  // Block 1 — non collapsible: identity + label + tag strip + description
  const block1 = document.createElement('section');
  block1.className = 'panel-block panel-block--main';
  block1.appendChild(titleField(node));
  const id = document.createElement('p');
  id.className = 'panel-id';
  id.textContent = `id : ${node.id}`;
  block1.appendChild(id);
  block1.appendChild(renderMetaStrip(node));
  block1.appendChild(field('tldr', 'Description', node.tldr, 'textarea'));
  panelEl.appendChild(block1);

  // Block 2 — non collapsible: content blocks
  const block2 = document.createElement('section');
  block2.className = 'panel-block';
  block2.appendChild(renderBlocksSection(node));
  panelEl.appendChild(block2);

  // Block 3 — collapsible: detailed configuration
  panelEl.appendChild(renderDetailsAccordion(node));

  // Block 4 — collapsible: improvements (feeds the roadmap)
  panelEl.appendChild(renderImprovementsSection(node));

  // Block 5 — collapsible: official plan measures (M1-M22) this page implements
  panelEl.appendChild(renderMesuresSection(node));

  // Block 6 — collapsible: linked dispositifs (with count badge)
  panelEl.appendChild(renderDispositifsSection(node));

  // Block 7 — collapsible: covered objectives (with count badge)
  panelEl.appendChild(renderObjectivesSection(node.id));

  // Block 8 — collapsible: Drupal properties (read-only mirror of the maquette page)
  panelEl.appendChild(renderMaquetteSection(node));

  // Block 6 — non collapsible: comments
  const block6 = document.createElement('section');
  block6.className = 'panel-block';
  block6.appendChild(renderCommentsSection(node.id));
  panelEl.appendChild(block6);

  // Action buttons at the bottom
  panelEl.appendChild(renderActionButtons(node, parent));
}

function renderActionButtons(node, parent) {
  const actions = document.createElement('div');
  actions.className = 'panel-actions panel-actions--bottom';

  const addChild = button('Sous-rubrique', 'fr-btn--secondary fr-icon-add-line fr-btn--icon-left', () => {
    const child = makeNode();
    node.children.push(child);
    state.collapsed.delete(node.id);
    state.selectedId = child.id;
    save(); saveCollapsed(); renderTree(); renderPanel();
  });
  actions.appendChild(addChild);

  if (parent) {
    const del = button('Supprimer', 'fr-btn--tertiary fr-icon-delete-line fr-btn--icon-left', () => {
      if (!confirm(`Supprimer « ${node.label} » et toute sa descendance ?`)) return;
      parent.children = parent.children.filter(c => c.id !== node.id);
      state.selectedId = parent.id;
      save(); renderTree(); renderPanel();
    });
    actions.appendChild(del);

    const moveUp = button('Monter', 'fr-btn--tertiary fr-icon-arrow-up-line fr-btn--icon-left', () => moveSibling(parent, node, -1));
    const moveDown = button('Descendre', 'fr-btn--tertiary fr-icon-arrow-down-line fr-btn--icon-left', () => moveSibling(parent, node, +1));
    actions.appendChild(moveUp);
    actions.appendChild(moveDown);

    const promote = button('↑ Niveau (sortir)', 'fr-btn--tertiary', () => promoteNode(node));
    promote.title = 'Faire remonter ce nœud d\'un niveau (sortir de son parent).';
    const demote = button('↓ Niveau (entrer)', 'fr-btn--tertiary', () => demoteNode(node));
    demote.title = 'Faire descendre ce nœud d\'un niveau (devenir enfant du frère précédent).';
    actions.appendChild(promote);
    actions.appendChild(demote);
  }
  return actions;
}

function titleField(node) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-input-group panel-title-group';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fr-input panel-title-input';
  input.value = node.label || '';
  input.setAttribute('aria-label', 'Libellé du nœud');
  input.addEventListener('input', () => {
    node.label = input.value;
    save();
    renderTree();
  });
  wrap.appendChild(input);
  return wrap;
}

function renderMetaStrip(node) {
  const metaStrip = document.createElement('div');
  metaStrip.className = 'panel-meta-strip';
  const types = (node.types && node.types.length) ? node.types : [primaryType(node)];
  for (const t of types) {
    const typePill = document.createElement('span');
    typePill.className = `type-pill type-${t}`;
    typePill.textContent = TYPES[t]?.label ?? t;
    metaStrip.appendChild(typePill);
  }
  if (node.deadline) {
    const dl = document.createElement('span');
    dl.className = `deadline-pill ${node.deadline}`;
    dl.textContent = DEADLINES[node.deadline] ?? node.deadline;
    metaStrip.appendChild(dl);
  }
  const tTech = Number.isFinite(+node.time_tech) ? +node.time_tech : null;
  const tEdito = Number.isFinite(+node.time_edito) ? +node.time_edito : null;
  if (tTech !== null || tEdito !== null) {
    const t = document.createElement('span');
    t.className = 'time-pill';
    const parts = [];
    if (tTech !== null) parts.push(`Tech ${tTech}j`);
    if (tEdito !== null) parts.push(`Édito ${tEdito}j`);
    t.textContent = parts.join(' · ');
    t.title = 'Charge estimée (jours)';
    metaStrip.appendChild(t);
  }
  const panelCommentN = state.commentCounts[node.id] || 0;
  if (panelCommentN > 0) {
    const c = document.createElement('span');
    c.className = 'comment-pill';
    c.textContent = `💬 ${panelCommentN}`;
    metaStrip.appendChild(c);
  }
  return metaStrip;
}

function renderDetailsAccordion(node) {
  const details = document.createElement('details');
  details.className = 'panel-accordion';
  const summary = document.createElement('summary');
  summary.className = 'panel-accordion__summary';
  const title = document.createElement('span');
  title.className = 'panel-accordion__title';
  title.textContent = 'Configuration détaillée';
  summary.appendChild(title);
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'panel-accordion__body';

  body.appendChild(deadlineField(node));
  body.appendChild(audiencesField(node));
  body.appendChild(typeField(node));
  body.appendChild(timeFields(node));

  details.appendChild(body);
  bindAccordion(details, 'config');
  return details;
}

function moveSibling(parent, node, delta) {
  const idx = parent.children.indexOf(node);
  const target = idx + delta;
  if (target < 0 || target >= parent.children.length) return;
  parent.children.splice(idx, 1);
  parent.children.splice(target, 0, node);
  save(); renderTree(); renderPanel();
}

function field(key, labelText, value, kind, type = 'text') {
  const wrap = document.createElement('div');
  wrap.className = kind === 'textarea' ? 'fr-input-group' : 'fr-input-group';
  const label = document.createElement('label');
  label.className = 'fr-label';
  label.textContent = labelText;
  const inputId = `field-${key}`;
  label.setAttribute('for', inputId);
  wrap.appendChild(label);

  const el = document.createElement(kind);
  el.id = inputId;
  el.className = kind === 'textarea' ? 'fr-input' : 'fr-input';
  if (kind === 'input') el.type = type;
  if (kind === 'textarea') el.rows = 4;
  el.value = value || '';
  el.addEventListener('input', () => {
    const found = find(state.selectedId);
    if (!found) return;
    found.node[key] = el.value;
    save();
    if (key === 'label') {
      // re-render tree to update the displayed label
      renderTree();
    }
  });
  wrap.appendChild(el);
  return wrap;
}

function typeField(node) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-input-group type-field';
  const label = document.createElement('label');
  label.className = 'fr-label';
  label.textContent = 'Types de page';
  wrap.appendChild(label);

  if (!Array.isArray(node.types)) node.types = [];
  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'type-chips';
  for (const [key, def] of Object.entries(TYPES)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    const isOn = node.types.includes(key);
    chip.className = `type-chip type-chip--${key}` + (isOn ? ' type-chip--on' : '');
    chip.textContent = def.label;
    chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    chip.addEventListener('click', () => {
      const idx = node.types.indexOf(key);
      if (idx >= 0) node.types.splice(idx, 1);
      else node.types.push(key);
      save(); renderTree(); renderPanel();
    });
    chipsWrap.appendChild(chip);
  }
  wrap.appendChild(chipsWrap);
  return wrap;
}

function deadlineField(node) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-input-group deadline-field';
  const label = document.createElement('label');
  label.className = 'fr-label';
  label.textContent = 'Échéance';
  wrap.appendChild(label);

  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'deadline-chips';
  for (const key of DEADLINE_ORDER) {
    const chip = document.createElement('button');
    chip.type = 'button';
    const isOn = node.deadline === key;
    chip.className = `deadline-chip deadline-chip--${key}` + (isOn ? ' deadline-chip--on' : '');
    chip.textContent = DEADLINES[key];
    chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    chip.addEventListener('click', () => {
      node.deadline = isOn ? '' : key;
      save(); renderTree(); renderPanel();
    });
    chipsWrap.appendChild(chip);
  }
  wrap.appendChild(chipsWrap);
  return wrap;
}

function timeFields(node) {
  const wrap = document.createElement('div');
  wrap.className = 'time-fields';

  const label = document.createElement('div');
  label.className = 'fr-label time-fields__label';
  label.textContent = 'Charge estimée (jours)';
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.className = 'time-fields__row';

  for (const [key, labelTxt] of [['time_tech', 'Tech'], ['time_edito', 'Édito']]) {
    const cell = document.createElement('label');
    cell.className = 'time-cell';
    cell.setAttribute('for', `field-${key}`);

    const tag = document.createElement('span');
    tag.className = 'time-cell__label';
    tag.textContent = labelTxt;
    cell.appendChild(tag);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.5';
    input.className = 'time-cell__input';
    input.id = `field-${key}`;
    input.placeholder = '—';
    input.value = node[key] ?? '';
    input.addEventListener('input', () => {
      const v = input.value.trim();
      node[key] = v === '' ? null : Number(v);
      save();
      renderPanel();
    });
    cell.appendChild(input);

    const unit = document.createElement('span');
    unit.className = 'time-cell__unit';
    unit.textContent = 'j';
    cell.appendChild(unit);

    row.appendChild(cell);
  }
  wrap.appendChild(row);
  return wrap;
}

function audiencesField(node) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-input-group audiences-field';

  const label = document.createElement('label');
  label.className = 'fr-label';
  label.textContent = 'Publics cibles (hérités du parent si vide)';
  wrap.appendChild(label);

  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'audience-chips';
  const selected = new Set(node.audiences || []);

  for (const [key, txt] of Object.entries(AUDIENCES)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'audience-chip' + (selected.has(key) ? ' audience-chip--on' : '');
    chip.textContent = txt;
    chip.dataset.key = key;
    chip.setAttribute('aria-pressed', selected.has(key) ? 'true' : 'false');
    chip.addEventListener('click', () => {
      if (!Array.isArray(node.audiences)) node.audiences = [];
      const idx = node.audiences.indexOf(key);
      if (idx >= 0) node.audiences.splice(idx, 1);
      else node.audiences.push(key);
      save();
      renderTree();
      renderPanel();
    });
    chipsWrap.appendChild(chip);
  }
  wrap.appendChild(chipsWrap);

  if ((node.audiences ?? []).length === 0) {
    const hint = document.createElement('p');
    hint.className = 'fr-text--xs audiences-hint';
    const inherited = audiencesFor(node);
    hint.textContent = inherited.length
      ? `Hérité : ${inherited.map(k => AUDIENCES[k] ?? k).join(', ')}`
      : 'Aucun public hérité du parent.';
    wrap.appendChild(hint);
  }
  return wrap;
}

function renderBlocksSection(node) {
  const section = document.createElement('section');
  section.className = 'blocks-section';

  const h = document.createElement('h3');
  h.className = 'fr-h6';
  h.textContent = 'Contenus de la page';
  section.appendChild(h);

  if (!Array.isArray(node.blocks)) node.blocks = [];

  const list = document.createElement('div');
  list.className = 'blocks-list';

  if (node.blocks.length === 0) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Aucun bloc défini. Ajoutez un bloc pour décrire un élément de contenu de la page (texte, vidéo, lien, CTA…).';
    list.appendChild(p);
  } else {
    for (const block of node.blocks) list.appendChild(renderBlockCard(node, block));
  }
  section.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-add-line fr-btn--icon-left blocks-add';
  addBtn.textContent = 'Ajouter un bloc';
  addBtn.addEventListener('click', () => {
    node.blocks.push(makeBlock());
    save(`Ajout d'un bloc à ${node.id}`);
    renderPanel();
    renderTree();
  });
  section.appendChild(addBtn);

  return section;
}

function renderBlockCard(node, block) {
  const card = document.createElement('div');
  card.className = 'block-card';
  card.dataset.blockId = block.id;
  card.draggable = true;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-block-id', block.id);
    card.classList.add('block-card--dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('block-card--dragging');
    document.querySelectorAll('.block-card').forEach(c => c.classList.remove('block-card--over-before', 'block-card--over-after'));
  });
  card.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/x-block-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = card.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    card.classList.toggle('block-card--over-before', before);
    card.classList.toggle('block-card--over-after', !before);
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('block-card--over-before', 'block-card--over-after');
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/x-block-id');
    const before = card.classList.contains('block-card--over-before');
    card.classList.remove('block-card--over-before', 'block-card--over-after');
    moveBlock(node, srcId, block.id, before);
  });

  const handle = document.createElement('span');
  handle.className = 'block-card__handle';
  handle.textContent = '⋮⋮';
  handle.title = 'Glisser pour réordonner';
  card.appendChild(handle);

  const fields = document.createElement('div');
  fields.className = 'block-card__fields';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'fr-input block-card__title';
  titleInput.placeholder = 'Titre du bloc';
  titleInput.value = block.title || '';
  titleInput.addEventListener('input', () => {
    block.title = titleInput.value;
    save();
  });
  fields.appendChild(titleInput);

  const desc = document.createElement('textarea');
  desc.className = 'fr-input block-card__desc';
  desc.placeholder = 'Description du contenu (ex. « Vidéo de 3 min expliquant… », « Lien vers le simulateur »)';
  desc.rows = 2;
  desc.value = block.description || '';
  desc.addEventListener('input', () => {
    block.description = desc.value;
    save();
  });
  fields.appendChild(desc);
  card.appendChild(fields);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'block-card__delete fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line';
  del.setAttribute('aria-label', 'Supprimer ce bloc');
  del.title = 'Supprimer';
  del.addEventListener('click', () => {
    node.blocks = node.blocks.filter(b => b.id !== block.id);
    save(`Suppression d'un bloc de ${node.id}`);
    renderPanel();
    renderTree();
  });
  card.appendChild(del);

  return card;
}

function moveBlock(node, srcId, targetId, before) {
  if (!srcId || srcId === targetId) return;
  const blocks = node.blocks;
  const srcIdx = blocks.findIndex(b => b.id === srcId);
  if (srcIdx < 0) return;
  const [src] = blocks.splice(srcIdx, 1);
  const tgtIdx = blocks.findIndex(b => b.id === targetId);
  const insertAt = before ? tgtIdx : tgtIdx + 1;
  blocks.splice(insertAt, 0, src);
  save(`Réorganisation des blocs de ${node.id}`);
  renderPanel();
}

// ---- Improvements section (feeds the roadmap) ----

function renderImprovementsSection(node) {
  if (!Array.isArray(node.improvements)) node.improvements = [];
  const wrap = document.createElement('details');
  wrap.className = 'panel-accordion improvements-section';
  wrap.appendChild(accordionSummary('Améliorations', node.improvements.length));

  const body = document.createElement('div');
  body.className = 'panel-accordion__body';

  const list = document.createElement('div');
  list.className = 'improvements-list';

  if (node.improvements.length === 0) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Aucune amélioration planifiée. Ajoutez une amélioration pour la voir apparaître dans la roadmap à l\'échéance correspondante.';
    list.appendChild(p);
  } else {
    for (const imp of node.improvements) list.appendChild(renderImprovementCard(node, imp));
  }
  body.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-add-line fr-btn--icon-left improvements-add';
  addBtn.textContent = 'Ajouter une amélioration';
  addBtn.addEventListener('click', () => {
    node.improvements.push(makeImprovement());
    save(`Ajout d'une amélioration à ${node.id}`);
    renderPanel();
  });
  body.appendChild(addBtn);

  wrap.appendChild(body);
  bindAccordion(wrap, 'improvements');
  return wrap;
}

function renderImprovementCard(node, imp) {
  const card = document.createElement('div');
  card.className = 'block-card improvement-card';
  card.dataset.improvementId = imp.id;
  card.draggable = true;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-improvement-id', imp.id);
    card.classList.add('block-card--dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('block-card--dragging');
    document.querySelectorAll('.improvement-card').forEach(c => c.classList.remove('block-card--over-before', 'block-card--over-after'));
  });
  card.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/x-improvement-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = card.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    card.classList.toggle('block-card--over-before', before);
    card.classList.toggle('block-card--over-after', !before);
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('block-card--over-before', 'block-card--over-after');
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/x-improvement-id');
    const before = card.classList.contains('block-card--over-before');
    card.classList.remove('block-card--over-before', 'block-card--over-after');
    moveImprovement(node, srcId, imp.id, before);
  });

  const handle = document.createElement('span');
  handle.className = 'block-card__handle';
  handle.textContent = '⋮⋮';
  handle.title = 'Glisser pour réordonner';
  card.appendChild(handle);

  const fields = document.createElement('div');
  fields.className = 'block-card__fields';

  // Deadline mini-chips (single-select, toggle off when re-clicked)
  const deadlineRow = document.createElement('div');
  deadlineRow.className = 'improvement-card__deadline';
  for (const key of DEADLINE_ORDER) {
    const chip = document.createElement('button');
    chip.type = 'button';
    const isOn = imp.deadline === key;
    chip.className = `deadline-chip deadline-chip--${key}` + (isOn ? ' deadline-chip--on' : '');
    chip.textContent = DEADLINES[key];
    chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    chip.addEventListener('click', () => {
      imp.deadline = isOn ? '' : key;
      save(`Échéance amélioration de ${node.id}`);
      renderPanel();
    });
    deadlineRow.appendChild(chip);
  }
  fields.appendChild(deadlineRow);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'fr-input block-card__title';
  titleInput.placeholder = 'Titre de l\'amélioration';
  titleInput.value = imp.title || '';
  titleInput.addEventListener('input', () => {
    imp.title = titleInput.value;
    save();
  });
  fields.appendChild(titleInput);

  const desc = document.createElement('textarea');
  desc.className = 'fr-input block-card__desc';
  desc.placeholder = 'Description (ex. « Ajouter un témoignage vidéo », « Intégrer le score environnemental »)';
  desc.rows = 2;
  desc.value = imp.description || '';
  desc.addEventListener('input', () => {
    imp.description = desc.value;
    save();
  });
  fields.appendChild(desc);
  card.appendChild(fields);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'block-card__delete fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line';
  del.setAttribute('aria-label', 'Supprimer cette amélioration');
  del.title = 'Supprimer';
  del.addEventListener('click', () => {
    node.improvements = node.improvements.filter(i => i.id !== imp.id);
    save(`Suppression d'une amélioration de ${node.id}`);
    renderPanel();
  });
  card.appendChild(del);

  return card;
}

function moveImprovement(node, srcId, targetId, before) {
  if (!srcId || srcId === targetId) return;
  const list = node.improvements;
  const srcIdx = list.findIndex(i => i.id === srcId);
  if (srcIdx < 0) return;
  const [src] = list.splice(srcIdx, 1);
  const tgtIdx = list.findIndex(i => i.id === targetId);
  const insertAt = before ? tgtIdx : tgtIdx + 1;
  list.splice(insertAt, 0, src);
  save(`Réorganisation des améliorations de ${node.id}`);
  renderPanel();
}

function button(text, classes, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `fr-btn ${classes}`;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// ---- Status indicator ----

function renderStatus() {
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

function renderIdentity() {
  const el = document.getElementById('identity-zone');
  if (!el) return;
  if (!collab.user) {
    el.innerHTML = '';
    return;
  }
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
    await reloadFromServer();
  });
  el.append('Identifié comme ', span, ' ', change);
}

// ---- Dispositifs linkage (read dispositifs data, manage node.dispositifs from the panel) ----

// Catalogues chargés via collab.fetchData('dispositifs'|'mesures'), scoped projet.
let dispositifsIndex = new Map();
let mesuresIndex     = new Map();   // id → { id, title, axe, deadline }

async function loadDispositifs() {
  try {
    const { data } = await collab.fetchData('dispositifs');
    for (const d of (data?.dispositifs ?? [])) {
      dispositifsIndex.set(d.id, { id: d.id, name: d.name, audience: d.audience, category: d.category });
    }
  } catch { /* non-fatal */ }
}

async function loadMesures() {
  try {
    const { data } = await collab.fetchData('mesures');
    for (const m of (data?.mesures ?? [])) {
      mesuresIndex.set(m.id, { id: m.id, title: m.title, axe: m.axe, deadline: m.deadline });
    }
  } catch { /* non-fatal */ }
}

function renderMesuresSection(node) {
  if (!Array.isArray(node.mesures)) node.mesures = [];
  const wrap = document.createElement('details');
  wrap.className = 'panel-accordion mesures-section';
  wrap.appendChild(accordionSummary('Mesures du plan', node.mesures.length));

  const body = document.createElement('div');
  body.className = 'panel-accordion__body';

  const list = document.createElement('div');
  list.className = 'mesure-link-list';

  if (node.mesures.length === 0) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Aucune mesure du plan rattachée. Reliez les mesures officielles dont cette page concrétise l\'engagement.';
    list.appendChild(p);
  } else {
    for (const mId of node.mesures) list.appendChild(renderMesureBadge(node, mId));
  }
  body.appendChild(list);
  body.appendChild(renderAddMesureButton(node));
  wrap.appendChild(body);
  bindAccordion(wrap, 'mesures');
  return wrap;
}

function renderMesureBadge(node, mId) {
  const m = mesuresIndex.get(mId);
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = m ? 'mesure-link-badge' : 'mesure-link-badge mesure-link-badge--unknown';
  badge.title = m
    ? `${m.title} (${mId}) — cliquer pour retirer · Maj+clic pour ouvrir la fiche`
    : `${mId} introuvable — cliquer pour retirer`;
  badge.innerHTML = `<span class="badge-id">${escapeHtml(mId)}</span> <span class="badge-label">${escapeHtml(m ? m.title : '?')}</span> <span class="badge-x">×</span>`;
  badge.addEventListener('click', (e) => {
    if (e.shiftKey && m) {
      window.open(`mesures.html#${encodeURIComponent(mId)}`, '_blank', 'noopener');
      return;
    }
    node.mesures = (node.mesures || []).filter(id => id !== mId);
    save(`Retrait mesure ${mId} de ${node.id}`);
    renderPanel(); renderTree();
  });
  return badge;
}

function renderAddMesureButton(node) {
  const wrap = document.createElement('div');
  wrap.className = 'add-link';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-link__btn fr-btn fr-btn--tertiary fr-btn--sm';
  btn.textContent = '+ lier une mesure du plan';
  wrap.appendChild(btn);

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input add-link__input';
    input.placeholder = 'rechercher une mesure (id Mxx ou libellé)…';
    const dropdown = document.createElement('ul');
    dropdown.className = 'add-link__dropdown';
    wrap.append(input, dropdown);
    input.focus();

    function refresh() {
      const term = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      if (!term) return;
      const already = new Set(node.mesures || []);
      const matches = [...mesuresIndex.values()]
        .filter(m => !already.has(m.id) && (m.title.toLowerCase().includes(term) || m.id.toLowerCase().includes(term)))
        .slice(0, 8);
      for (const m of matches) {
        const li = document.createElement('li');
        li.className = 'add-link__option';
        li.innerHTML = `<span class="badge-id">${escapeHtml(m.id)}</span> ${escapeHtml(m.title)}`;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (!node.mesures) node.mesures = [];
          node.mesures.push(m.id);
          save(`Ajout mesure ${m.id} à ${node.id}`);
          renderPanel(); renderTree();
        });
        dropdown.appendChild(li);
      }
    }
    input.addEventListener('input', refresh);
    input.addEventListener('blur', () => setTimeout(() => renderPanel(), 200));
  });
  return wrap;
}

function renderDispositifsSection(node) {
  if (!node.dispositifs) node.dispositifs = [];
  const wrap = document.createElement('details');
  wrap.className = 'panel-accordion dispositifs-section';
  wrap.appendChild(accordionSummary('Dispositifs rattachés', node.dispositifs.length));

  const body = document.createElement('div');
  body.className = 'panel-accordion__body';

  const list = document.createElement('div');
  list.className = 'dispositif-link-list';

  if (node.dispositifs.length === 0) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Aucun dispositif rattaché.';
    list.appendChild(p);
  } else {
    for (const dispId of node.dispositifs) list.appendChild(renderDispositifBadge(node, dispId));
  }
  body.appendChild(list);
  body.appendChild(renderAddDispositifButton(node));
  wrap.appendChild(body);
  bindAccordion(wrap, 'dispositifs');
  return wrap;
}

function renderMaquetteSection(node) {
  const m = node.maquette;
  const tax = (m && m.taxonomy) || {};
  const paragraphs = (m && m.paragraphs) || [];
  // Compteur synthétique (drupal_type compte pour 1 si renseigné)
  let count = 0;
  if (m && m.drupal_type) count++;
  if (tax.univers) count++;
  if (Array.isArray(tax.cibles)) count += tax.cibles.length;
  if (Array.isArray(tax.mesures)) count += tax.mesures.length;
  count += paragraphs.length;

  const wrap = document.createElement('details');
  wrap.className = 'panel-accordion maquette-section';
  wrap.appendChild(accordionSummary('Propriétés de la page', count));

  const body = document.createElement('div');
  body.className = 'panel-accordion__body';

  if (!m) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Pas encore de propriétés pour ce nœud. Ouvrez la maquette pour les initialiser.';
    body.appendChild(p);
  } else {
    body.appendChild(maquetteRow('Type de page', m.drupal_type || '—'));
    body.appendChild(maquetteRow('Type éditorial', tax.univers || '—'));
    body.appendChild(maquetteRow('Public', (tax.cibles || []).join(', ') || '—'));
    body.appendChild(maquetteRow('Mesure(s)', (tax.mesures || []).join(', ') || '—'));

    const parWrap = document.createElement('div');
    parWrap.className = 'maquette-section__row';
    const lab = document.createElement('span');
    lab.className = 'maquette-section__label';
    lab.textContent = `Composants (${paragraphs.length})`;
    parWrap.appendChild(lab);
    const val = document.createElement('span');
    val.className = 'maquette-section__value';
    if (paragraphs.length === 0) {
      val.textContent = '—';
    } else {
      val.innerHTML = paragraphs.map(p =>
        `<span class="maquette-section__chip" title="${escapeHtml(p.title || '')}">${escapeHtml(p.code)}${p.title || p.data != null ? ' ✎' : ''}</span>`
      ).join(' ');
    }
    parWrap.appendChild(val);
    body.appendChild(parWrap);
  }

  const link = document.createElement('a');
  link.href = `maquette.html#${encodeURIComponent(node.id)}`;
  link.className = 'fr-btn fr-btn--sm fr-btn--secondary fr-icon-edit-line fr-btn--icon-left fr-mt-2w';
  link.textContent = 'Éditer dans la maquette';
  body.appendChild(link);

  wrap.appendChild(body);
  bindAccordion(wrap, 'maquette');
  return wrap;
}

function maquetteRow(label, value) {
  const row = document.createElement('div');
  row.className = 'maquette-section__row';
  const lab = document.createElement('span');
  lab.className = 'maquette-section__label';
  lab.textContent = label;
  const val = document.createElement('span');
  val.className = 'maquette-section__value';
  val.textContent = value;
  row.append(lab, val);
  return row;
}

function accordionSummary(title, count) {
  const summary = document.createElement('summary');
  summary.className = 'panel-accordion__summary';
  const txt = document.createElement('span');
  txt.className = 'panel-accordion__title';
  txt.textContent = title;
  summary.appendChild(txt);
  const badge = document.createElement('span');
  badge.className = 'panel-accordion__count' + (count > 0 ? '' : ' panel-accordion__count--empty');
  badge.textContent = count;
  summary.appendChild(badge);
  return summary;
}

function renderDispositifBadge(node, dispId) {
  const d = dispositifsIndex.get(dispId);
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = d ? 'objective-link-badge' : 'objective-link-badge node-link-badge--unknown';
  badge.title = d ? `${d.name} (${dispId}) — cliquer pour retirer` : `${dispId} introuvable — cliquer pour retirer`;
  badge.innerHTML = `<span class="badge-id">${escapeHtml(dispId)}</span> <span class="badge-label">${escapeHtml(d ? d.name : '?')}</span> <span class="badge-x">×</span>`;
  badge.addEventListener('click', () => {
    node.dispositifs = (node.dispositifs || []).filter(id => id !== dispId);
    save(`Retrait dispositif ${dispId} de ${node.id}`);
    renderPanel(); renderTree();
  });
  return badge;
}

function renderAddDispositifButton(node) {
  const wrap = document.createElement('div');
  wrap.className = 'add-link';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-link__btn fr-btn fr-btn--tertiary fr-btn--sm';
  btn.textContent = '+ lier un dispositif';
  wrap.appendChild(btn);

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input add-link__input';
    input.placeholder = 'rechercher un dispositif (id D-Lxx ou nom)…';
    const dropdown = document.createElement('ul');
    dropdown.className = 'add-link__dropdown';
    wrap.append(input, dropdown);
    input.focus();

    function refresh() {
      const term = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      if (!term) return;
      const already = new Set(node.dispositifs || []);
      const matches = [...dispositifsIndex.values()]
        .filter(d => !already.has(d.id) && (d.name.toLowerCase().includes(term) || d.id.toLowerCase().includes(term)))
        .slice(0, 8);
      for (const d of matches) {
        const li = document.createElement('li');
        li.className = 'add-link__option';
        li.innerHTML = `<span class="badge-id">${escapeHtml(d.id)}</span> ${escapeHtml(d.name)}`;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (!node.dispositifs) node.dispositifs = [];
          node.dispositifs.push(d.id);
          save(`Ajout dispositif ${d.id} à ${node.id}`);
          renderPanel(); renderTree();
        });
        dropdown.appendChild(li);
      }
    }
    input.addEventListener('input', refresh);
    input.addEventListener('blur', () => setTimeout(() => renderPanel(), 200));
  });
  return wrap;
}

// ---- Objectives linkage (reverse of objectifs.js: from a node, manage its means) ----

let objectifsData = null;

async function loadObjectifs() {
  try {
    const { data } = await collab.fetchData('objectifs');
    return data || null;
  } catch { return null; }
}

let objectifsSaveTimer = null;
function saveObjectifs() {
  if (!objectifsData) return;
  if (objectifsSaveTimer) clearTimeout(objectifsSaveTimer);
  objectifsSaveTimer = setTimeout(() => {
    collab.saveData('objectifs', objectifsData).catch(() => { /* non-fatal */ });
  }, 500);
}

function allMeans() {
  if (!objectifsData) return [];
  return objectifsData.axes.flatMap(a =>
    a.objectives.flatMap(o => o.means.map(m => ({ ...m, _axe: a.name, _objective: o.name })))
  );
}

function meansForNode(nodeId) {
  return allMeans().filter(m => (m.nodes || []).includes(nodeId));
}

function findMean(meanId) {
  if (!objectifsData) return null;
  for (const a of objectifsData.axes) for (const o of a.objectives) for (const m of o.means) {
    if (m.id === meanId) return m;
  }
  return null;
}

function linkObjective(meanId, nodeId) {
  const m = findMean(meanId);
  if (!m) return;
  if (!m.nodes) m.nodes = [];
  if (!m.nodes.includes(nodeId)) m.nodes.push(nodeId);
  saveObjectifs();
}

function unlinkObjective(meanId, nodeId) {
  const m = findMean(meanId);
  if (!m) return;
  m.nodes = (m.nodes || []).filter(id => id !== nodeId);
  saveObjectifs();
}

function truncate(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; }

function renderObjectivesSection(nodeId) {
  const linked = objectifsData ? meansForNode(nodeId) : [];
  const wrap = document.createElement('details');
  wrap.className = 'panel-accordion objectives-section';
  wrap.appendChild(accordionSummary('Objectifs couverts', linked.length));

  const body = document.createElement('div');
  body.className = 'panel-accordion__body';

  if (!objectifsData) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.textContent = 'Pyramide stratégique non chargée — réessayez dans quelques instants.';
    body.appendChild(p);
    wrap.appendChild(body);
    bindAccordion(wrap, 'objectives');
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'objective-link-list';

  if (linked.length === 0) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Aucun objectif rattaché à cette page.';
    list.appendChild(p);
  } else {
    for (const mean of linked) list.appendChild(renderMeanBadge(mean, nodeId));
  }
  body.appendChild(list);
  body.appendChild(renderAddObjectiveButton(nodeId));
  wrap.appendChild(body);
  bindAccordion(wrap, 'objectives');
  return wrap;
}

function renderMeanBadge(mean, nodeId) {
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'objective-link-badge';
  badge.title = `${mean._axe} → ${mean._objective}\n${mean.text}\n\nCliquer pour retirer ce lien.`;
  badge.innerHTML = `<span class="badge-id">${escapeHtml(mean.id)}</span> <span class="badge-label">${escapeHtml(truncate(mean.text, 70))}</span> <span class="badge-x">×</span>`;
  badge.addEventListener('click', () => {
    unlinkObjective(mean.id, nodeId);
    renderPanel();
  });
  return badge;
}

function renderAddObjectiveButton(nodeId) {
  const wrap = document.createElement('div');
  wrap.className = 'add-link';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-link__btn fr-btn fr-btn--tertiary fr-btn--sm';
  btn.textContent = '+ lier un objectif';
  wrap.appendChild(btn);

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input add-link__input';
    input.placeholder = 'rechercher un moyen (id A1.O1.M1 ou texte)…';
    const dropdown = document.createElement('ul');
    dropdown.className = 'add-link__dropdown';
    wrap.append(input, dropdown);
    input.focus();

    function refresh() {
      const term = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      if (!term) return;
      const already = new Set(meansForNode(nodeId).map(m => m.id));
      const matches = allMeans()
        .filter(m => !already.has(m.id))
        .filter(m => m.id.toLowerCase().includes(term) || m.text.toLowerCase().includes(term))
        .slice(0, 8);
      for (const m of matches) {
        const li = document.createElement('li');
        li.className = 'add-link__option';
        li.innerHTML = `<span class="badge-id">${escapeHtml(m.id)}</span> ${escapeHtml(truncate(m.text, 90))}`;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          linkObjective(m.id, nodeId);
          renderPanel();
        });
        dropdown.appendChild(li);
      }
    }
    input.addEventListener('input', refresh);
    input.addEventListener('blur', () => setTimeout(() => renderPanel(), 200));
  });
  return wrap;
}

// ---- Comments ----

function renderCommentsSection(nodeId) {
  const wrap = document.createElement('div');
  wrap.className = 'comments-section';
  const h = document.createElement('h3');
  h.className = 'fr-h6 fr-mt-4w';
  h.textContent = 'Commentaires';
  wrap.appendChild(h);

  const list = document.createElement('div');
  list.className = 'comment-list';
  list.textContent = 'Chargement…';
  wrap.appendChild(list);

  const form = document.createElement('form');
  form.className = 'comment-form';
  form.innerHTML = `
    <div class="fr-input-group">
      <label class="fr-label" for="comment-body">Ajouter un commentaire</label>
      <textarea class="fr-input" id="comment-body" rows="2" maxlength="4000" placeholder="Votre remarque, question, proposition…"></textarea>
    </div>
    <div class="panel-actions">
      <button type="submit" class="fr-btn fr-btn--secondary fr-icon-chat-3-line fr-btn--icon-left">Publier</button>
    </div>
  `;
  wrap.appendChild(form);

  async function refresh() {
    try {
      const { comments } = await collab.fetchComments(nodeId);
      list.innerHTML = '';
      if (comments.length === 0) {
        list.innerHTML = '<p class="panel-empty">Aucun commentaire.</p>';
      } else {
        for (const c of comments) list.appendChild(renderComment(c, refresh));
      }
      // refresh global counts
      const { counts } = await collab.fetchCommentCounts();
      state.commentCounts = counts || {};
      renderTree();
    } catch (e) {
      list.innerHTML = `<p class="panel-empty">Erreur : ${escapeHtml(e.message)}</p>`;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = form.querySelector('#comment-body');
    const body = ta.value.trim();
    if (!body) return;
    try {
      await collab.postComment(nodeId, body);
      ta.value = '';
      await refresh();
    } catch (err) {
      if (err.status === 401) { await ensureIdentified(); }
      else alert('Erreur : ' + err.message);
    }
  });

  refresh();
  return wrap;
}

function renderComment(c, onChange) {
  const item = document.createElement('article');
  item.className = 'comment-item';
  const head = document.createElement('div');
  head.className = 'comment-head';
  const author = document.createElement('strong');
  author.textContent = c.author?.name || '?';
  const date = document.createElement('span');
  date.className = 'comment-date';
  date.textContent = formatDate(c.created_at);
  head.append(author, date);
  if (collab.user && c.author?.id === collab.user.id) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line';
    del.title = 'Supprimer';
    del.setAttribute('aria-label', 'Supprimer le commentaire');
    del.addEventListener('click', async () => {
      if (!confirm('Supprimer ce commentaire ?')) return;
      await collab.deleteComment(c.id);
      onChange();
    });
    head.appendChild(del);
  }
  const body = document.createElement('div');
  body.className = 'comment-body';
  body.textContent = c.body;
  item.append(head, body);
  return item;
}

// ---- History dialog ----

async function openHistoryDialog() {
  const dlg = openDialog('Historique des révisions');
  const layout = document.createElement('div');
  layout.className = 'history-layout';
  dlg.body.appendChild(layout);

  const left = document.createElement('div');
  left.className = 'history-list';
  left.textContent = 'Chargement…';
  const right = document.createElement('div');
  right.className = 'history-detail';
  right.innerHTML = '<p class="panel-empty">Sélectionnez une révision pour voir le diff.</p>';
  layout.append(left, right);

  let revisions = [];
  let headId = null;
  try {
    const data = await collab.fetchHistory();
    revisions = data.revisions;
    headId = data.head_id;
  } catch (e) {
    left.textContent = 'Erreur : ' + e.message;
    return;
  }

  left.innerHTML = '';
  const itemsById = new Map();
  for (const r of revisions) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    if (r.id === headId) item.classList.add('history-item--head');
    item.innerHTML = `
      <div class="history-item__head">
        <span class="history-item__id">#${r.id}${r.id === headId ? ' · HEAD' : ''}</span>
        <span class="history-item__author">${escapeHtml(r.author?.name || '?')}</span>
      </div>
      <div class="history-item__msg">${escapeHtml(r.message || '(sans message)')}</div>
      <div class="history-item__date">${escapeHtml(formatDate(r.created_at))}${r.reverts_id ? ` · revert de #${r.reverts_id}` : ''}</div>
    `;
    item.addEventListener('click', () => showRevisionDetail(r));
    itemsById.set(r.id, item);
    left.appendChild(item);
  }

  function highlightSelection(id) {
    for (const [rid, el] of itemsById) {
      el.classList.toggle('history-item--selected', rid === id);
    }
  }

  async function showRevisionDetail(r) {
    highlightSelection(r.id);
    right.innerHTML = '<p class="panel-empty">Chargement du diff…</p>';
    try {
      const cur = await collab.fetchRevision(r.id);
      let parentTree = null;
      if (r.parent_id) {
        const p = await collab.fetchRevision(r.parent_id);
        parentTree = p.tree;
      }
      right.innerHTML = '';

      const meta = document.createElement('div');
      meta.className = 'history-meta';
      meta.innerHTML = `
        <h3 class="fr-h6">Révision #${r.id}</h3>
        <p class="fr-text--sm">
          Par <strong>${escapeHtml(r.author?.name || '?')}</strong>
          le ${escapeHtml(formatDate(r.created_at))}<br>
          ${r.parent_id ? `Parent : <code>#${r.parent_id}</code>` : '<em>Révision initiale</em>'}
          ${r.reverts_id ? ` · Revert de <code>#${r.reverts_id}</code>` : ''}
        </p>
        <p class="fr-text--sm"><strong>Message :</strong> ${escapeHtml(r.message || '(aucun)')}</p>
      `;
      right.appendChild(meta);

      const diffWrap = document.createElement('div');
      diffWrap.className = 'history-diff';
      const diffTitle = document.createElement('h4');
      diffTitle.className = 'fr-h6 fr-mt-3w';
      diffTitle.textContent = parentTree ? 'Différences avec la révision parente' : 'Contenu initial';
      diffWrap.appendChild(diffTitle);

      const diffBody = document.createElement('div');
      if (parentTree) {
        renderDiff(diffBody, parentTree, cur.tree);
      } else {
        diffBody.innerHTML = `<p class="panel-empty">${countNodes(cur.tree)} nœuds initiaux.</p>`;
      }
      diffWrap.appendChild(diffBody);
      right.appendChild(diffWrap);

      const actions = document.createElement('div');
      actions.className = 'panel-actions';
      if (r.id !== headId) {
        const revertBtn = button('Revenir à cette révision', 'fr-btn--secondary fr-icon-arrow-go-back-line fr-btn--icon-left', async () => {
          if (!confirm(`Créer une nouvelle révision identique à #${r.id} ?\n\n(L'historique est conservé : c'est un revert, pas un effacement.)`)) return;
          try {
            await collab.revert(r.id, `Revert vers #${r.id}`);
            await reloadFromServer();
            dlg.dialog.close();
          } catch (e) {
            alert('Revert impossible : ' + e.message);
          }
        });
        actions.appendChild(revertBtn);
      }
      const exportBtn = button('Exporter JSON', 'fr-btn--secondary fr-icon-download-line fr-btn--icon-left', () => {
        const payload = JSON.stringify({ revision: r, tree: cur.tree }, null, 2);
        showExport(`Révision #${r.id} — JSON`, payload, `revision-${r.id}.json`, 'application/json');
      });
      actions.appendChild(exportBtn);
      const close = button('Fermer', 'fr-btn--tertiary', () => dlg.dialog.close());
      actions.appendChild(close);
      right.appendChild(actions);
    } catch (e) {
      right.innerHTML = `<p class="panel-empty">Erreur : ${escapeHtml(e.message)}</p>`;
    }
  }

  if (revisions.length > 0) showRevisionDetail(revisions[0]);
}

function countNodes(root) {
  let n = 0;
  for (const _ of walk(root)) n++;
  return n;
}

async function reloadFromServer() {
  const { tree, revision } = await collab.fetchTree();
  normalizeNode(tree);
  state.tree = tree;
  collab.currentRevisionId = revision.id;
  if (!find(state.selectedId)) state.selectedId = state.tree.id;
  state.saveStatus = 'saved';
  renderStatus();
  renderTree();
  renderPanel();
}

// ---- Exports ----

function exportJson() {
  showExport('Export JSON', JSON.stringify(state.tree, null, 2), 'arborescence.json', 'application/json');
}

function buildMermaidSource() {
  const lines = ['flowchart LR'];
  const safeId = (id) => id.replace(/[^a-zA-Z0-9_]/g, '_');
  const escape = (s) => String(s).replace(/"/g, '#quot;');
  function rec(node) {
    const sid = safeId(node.id);
    const t = primaryType(node);
    const typeLabel = TYPES[t]?.label ?? t;
    const label = `${escape(node.label)}<br/><i>${escape(typeLabel)}</i>`;
    lines.push(`  ${sid}["${label}"]:::t-${t}`);
    for (const c of node.children ?? []) {
      lines.push(`  ${sid} --> ${safeId(c.id)}`);
      rec(c);
    }
  }
  rec(state.tree);
  // Class definitions echoing the type-pill colors used in the tree.
  lines.push(
    'classDef t-hub         fill:#f4f4fc,stroke:#6a6af4,color:#3a3a8c;',
    'classDef t-editorial   fill:#ffffff,stroke:#bbbbbb,color:#444444;',
    'classDef t-service     fill:#e8edff,stroke:#8b9ed9,color:#2a3994;',
    'classDef t-simulator   fill:#fee7fc,stroke:#d28aa3,color:#6e445a;',
    'classDef t-map         fill:#b8fec9,stroke:#5cba7a,color:#18753c;',
    'classDef t-external    fill:#fff6e3,stroke:#d4be91,color:#716043;',
    'classDef t-marketplace fill:#ffe8e5,stroke:#e8a08a,color:#b34000;',
    'classDef t-kit         fill:#fef7da,stroke:#d4c891,color:#716043;',
    'classDef t-form        fill:#e0f3ff,stroke:#88b8e0,color:#0063cb;',
    'classDef t-private     fill:#efeae3,stroke:#a8998a,color:#5e5045;',
  );
  return lines.join('\n');
}

let mermaidPromise = null;
function ensureMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs').then(mod => {
      const m = mod.default ?? mod;
      m.initialize({ startOnLoad: false, securityLevel: 'loose', flowchart: { htmlLabels: true, useMaxWidth: false } });
      return m;
    });
  }
  return mermaidPromise;
}

async function viewGraph() {
  const dlg = openDialog('Vue graphique');
  const container = document.createElement('div');
  container.className = 'graph-container';
  container.textContent = 'Génération du diagramme…';
  dlg.body.appendChild(container);

  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  dlg.body.appendChild(actions);

  let svgSource = '';
  try {
    const mermaid = await ensureMermaid();
    const source = buildMermaidSource();
    const { svg } = await mermaid.render('graph-' + Date.now(), source);
    container.innerHTML = svg;
    svgSource = svg;
  } catch (e) {
    container.textContent = 'Erreur de rendu : ' + e.message;
    return;
  }

  actions.appendChild(button('Télécharger SVG', 'fr-btn--secondary fr-icon-download-line fr-btn--icon-left', () => {
    const blob = new Blob([svgSource], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'arborescence.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  }));
  actions.appendChild(button('Copier la source Mermaid', 'fr-btn--tertiary fr-icon-clipboard-line fr-btn--icon-left', async () => {
    try { await navigator.clipboard.writeText(buildMermaidSource()); } catch {}
  }));
  actions.appendChild(button('Fermer', 'fr-btn--tertiary', () => dlg.dialog.close()));
}

function openDialog(title) {
  let dialog = document.getElementById('app-dialog');
  if (dialog) dialog.remove();
  dialog = document.createElement('dialog');
  dialog.id = 'app-dialog';
  dialog.className = 'app-dialog';

  const header = document.createElement('div');
  header.className = 'app-dialog__header';

  const h = document.createElement('h2');
  h.className = 'fr-h6 app-dialog__title';
  h.textContent = title;
  header.appendChild(h);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'app-dialog__close';
  closeBtn.setAttribute('aria-label', 'Fermer');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => dialog.close());
  header.appendChild(closeBtn);

  dialog.appendChild(header);

  const body = document.createElement('div');
  body.className = 'app-dialog__body';
  dialog.appendChild(body);

  document.body.appendChild(dialog);
  dialog.showModal();
  return { dialog, body };
}

function showExport(title, content, filename, mime) {
  const dlg = openDialog(title);

  const ta = document.createElement('textarea');
  ta.className = 'export-textarea';
  ta.value = content;
  ta.readOnly = true;
  dlg.body.appendChild(ta);

  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  actions.appendChild(button('Copier', 'fr-btn--secondary fr-icon-clipboard-line fr-btn--icon-left', async () => {
    try { await navigator.clipboard.writeText(content); } catch { ta.select(); document.execCommand('copy'); }
  }));
  actions.appendChild(button('Télécharger', 'fr-btn--secondary fr-icon-download-line fr-btn--icon-left', () => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }));
  actions.appendChild(button('Fermer', 'fr-btn--tertiary', () => dlg.dialog.close()));
  dlg.body.appendChild(actions);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.id || !parsed.label) throw new Error('Format invalide');
      normalizeNode(parsed);
      state.tree = parsed;
      state.selectedId = parsed.id;
      save('Import JSON');
      renderTree();
      renderPanel();
    } catch (e) {
      alert('Import impossible : ' + e.message);
    }
  };
  reader.readAsText(file);
}

// ---- Toolbar wiring ----

document.querySelectorAll('[data-action]').forEach(btn => {
  const action = btn.dataset.action;
  btn.addEventListener('click', () => {
    switch (action) {
      case 'add-root': {
        const child = makeNode('Nouvelle rubrique');
        state.tree.children.push(child);
        state.selectedId = child.id;
        save(); renderTree(); renderPanel();
        break;
      }
      case 'export-json': exportJson(); break;
      case 'view-graph':  viewGraph(); break;
      case 'view-history': openHistoryDialog(); break;
      case 'import-json':
        document.getElementById('import-file').click();
        break;
      case 'reset-proposition':
        if (!defaultTree) { alert('Données par défaut non chargées.'); break; }
        if (confirm('Recharger l\'arborescence depuis la proposition tree.json ?\n\nCela crée une nouvelle révision (l\'historique est conservé).')) {
          state.tree = structuredClone(defaultTree);
          state.selectedId = state.tree.id;
          state.collapsed.clear();
          save('Réinitialisation depuis tree.json'); saveCollapsed(); renderTree(); renderPanel();
        }
        break;
      case 'reset-scratch':
        if (!defaultTree) { alert('Données par défaut non chargées.'); break; }
        if (confirm('Repartir d\'une arborescence vide ?\n\nLa racine (« ' + defaultTree.label + ' ») est conservée, tous ses enfants sont retirés. Cela crée une nouvelle révision (l\'historique est conservé).')) {
          const emptyRoot = structuredClone(defaultTree);
          emptyRoot.children = [];
          state.tree = emptyRoot;
          state.selectedId = state.tree.id;
          state.collapsed.clear();
          save('Réinitialisation : arborescence vidée'); saveCollapsed(); renderTree(); renderPanel();
        }
        break;
    }
  });
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importJson(file);
  e.target.value = '';
});

document.getElementById('search-input').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderTree();
});

document.getElementById('deadline-filter').addEventListener('change', (e) => {
  state.deadline = e.target.value;
  renderTree();
});

// ---- Boot ----

async function init() {
  treeEl.innerHTML = '<p class="panel-empty">Chargement de l\'arborescence…</p>';
  // Default tree (used by "Réinitialiser") fetched independently of history.
  try {
    const res = await fetch(DEFAULT_TREE_URL, { cache: 'no-cache' });
    if (res.ok) {
      defaultTree = await res.json();
      normalizeNode(defaultTree);
    }
  } catch { /* non-fatal */ }

  // Pyramide stratégique (used by the "Objectifs couverts" field in the panel).
  loadObjectifs().then(d => { objectifsData = d; if (state.tree) renderPanel(); });

  // Dispositifs (used by the "Dispositifs rattachés" field in the panel).
  loadDispositifs().then(() => { if (state.tree) renderPanel(); });

  // Mesures du plan (used by the "Mesures du plan" field in the panel).
  loadMesures().then(() => { if (state.tree) renderPanel(); });

  await ensureIdentified();
  renderIdentity();

  try {
    const { tree, revision } = await collab.fetchTree();
    normalizeNode(tree);
    state.tree = tree;
    collab.currentRevisionId = revision.id;
    // Honour ?node=<id> handoff from the roadmap, falling back to root.
    const requested = new URL(window.location.href).searchParams.get('node');
    state.selectedId = (requested && find(requested, tree)) ? requested : tree.id;
    state.saveStatus = 'saved';
  } catch (e) {
    treeEl.innerHTML = `<p class="panel-empty">Impossible de charger l'arborescence depuis le serveur : ${e.message}.</p>`;
    return;
  }

  try {
    const { counts } = await collab.fetchCommentCounts();
    state.commentCounts = counts || {};
  } catch { /* non-fatal */ }

  renderTree();
  renderPanel();
  renderStatus();
}

init();
