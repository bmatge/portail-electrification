// Tree editor for the hub d'info arborescence. Persisted server-side via /api.

import { collab, ensureIdentified, escapeHtml, formatDate, renderDiff } from './collab.js';

const COLLAPSED_KEY = 'portail-electrification.collapsed.v1';

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

const PRIORITIES = {
  mvp: 'MVP',
  v1:  'V1',
  v2:  'V2',
  v3:  'V3',
};

const PRIORITY_RANK = { mvp: 0, v1: 1, v2: 2, v3: 3 };

const COMPLEXITIES = {
  low:    'Faible',
  medium: 'Moyenne',
  high:   'Élevée',
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
  priority: 'all',
  commentCounts: {},
  saveStatus: 'idle', // 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
  saveMessage: '',
};

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
    const raw = localStorage.getItem(COLLAPSED_KEY);
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
  return { id: newId(), label, type: 'editorial', format: '', tldr: '', url: '', priority: '', complexity: '', auth: false, children: [] };
}

// ---- Rendering ----

const treeEl = document.getElementById('tree');
const panelEl = document.getElementById('panel');
const legendEl = document.getElementById('legend');
const counterEl = document.getElementById('counter');

function matchesFilters(node) {
  const term = state.search.trim().toLowerCase();
  const labelMatch = !term || node.label.toLowerCase().includes(term) || (node.tldr || '').toLowerCase().includes(term);
  const priorityMatch = matchesPriority(node);
  return labelMatch && priorityMatch;
}

function matchesPriority(node) {
  if (state.priority === 'all') return true;
  if (state.priority === 'none') return !node.priority;
  const cap = PRIORITY_RANK[state.priority];
  if (cap === undefined) return true;
  if (!node.priority) return false;
  const rank = PRIORITY_RANK[node.priority];
  return rank !== undefined && rank <= cap;
}

function subtreeMatches(node) {
  if (matchesFilters(node)) return true;
  return (node.children ?? []).some(subtreeMatches);
}

function renderTree() {
  treeEl.innerHTML = '';
  treeEl.appendChild(renderNode(state.tree));
  renderLegend();
  renderCounter();
}

function renderNode(node) {
  const wrapper = document.createElement('ul');
  const li = document.createElement('li');
  li.setAttribute('role', 'treeitem');
  li.dataset.id = node.id;

  const row = document.createElement('div');
  row.className = 'node-row';
  if (node.id === state.selectedId) row.classList.add('selected');
  if (!subtreeMatches(node)) row.classList.add('dim');

  const hasChildren = (node.children ?? []).length > 0;
  const toggle = document.createElement('button');
  toggle.className = 'node-toggle';
  toggle.type = 'button';
  if (!hasChildren) toggle.classList.add('placeholder');
  toggle.textContent = state.collapsed.has(node.id) ? '▸' : '▾';
  toggle.setAttribute('aria-label', state.collapsed.has(node.id) ? 'Déplier' : 'Replier');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.collapsed.has(node.id)) state.collapsed.delete(node.id);
    else state.collapsed.add(node.id);
    saveCollapsed();
    renderTree();
  });

  const label = document.createElement('span');
  label.className = 'node-label';
  label.textContent = node.label;

  const meta = document.createElement('span');
  meta.className = 'node-meta';

  const typePill = document.createElement('span');
  typePill.className = `type-pill type-${node.type}`;
  typePill.textContent = TYPES[node.type]?.label ?? node.type;
  meta.appendChild(typePill);

  if (node.priority) {
    const pri = document.createElement('span');
    pri.className = `priority-pill ${node.priority}`;
    pri.textContent = PRIORITIES[node.priority];
    meta.appendChild(pri);
  }

  if (node.complexity) {
    const cx = document.createElement('span');
    cx.className = `complexity-pill ${node.complexity}`;
    cx.textContent = COMPLEXITIES[node.complexity];
    cx.title = `Complexité ${COMPLEXITIES[node.complexity].toLowerCase()}`;
    meta.appendChild(cx);
  }

  if (node.auth) {
    const auth = document.createElement('span');
    auth.className = 'auth-pill';
    auth.textContent = 'Auth';
    auth.setAttribute('aria-label', 'Authentification requise');
    auth.title = 'Authentification requise';
    meta.appendChild(auth);
  }

  const commentN = state.commentCounts[node.id] || 0;
  if (commentN > 0) {
    const c = document.createElement('span');
    c.className = 'comment-pill';
    c.textContent = `💬 ${commentN}`;
    c.title = `${commentN} commentaire${commentN > 1 ? 's' : ''}`;
    meta.appendChild(c);
  }

  row.append(toggle, label, meta);
  row.addEventListener('click', () => {
    state.selectedId = node.id;
    renderTree();
    renderPanel();
  });

  li.appendChild(row);

  if (hasChildren && !state.collapsed.has(node.id)) {
    const childUl = document.createElement('ul');
    for (const child of node.children) {
      const sub = renderNode(child);
      // renderNode wraps in <ul><li>; unwrap to single ul
      childUl.appendChild(sub.firstElementChild);
    }
    li.appendChild(childUl);
  }

  wrapper.appendChild(li);
  return wrapper;
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

  const actions = document.createElement('div');
  actions.className = 'panel-actions panel-actions--top';

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
  }
  panelEl.appendChild(actions);

  const id = document.createElement('p');
  id.className = 'panel-id';
  id.textContent = `id : ${node.id}`;
  panelEl.appendChild(id);

  panelEl.appendChild(field('tldr', 'TL;DR', node.tldr, 'textarea'));
  panelEl.appendChild(field('label', 'Libellé', node.label, 'input'));
  panelEl.appendChild(typeField(node));
  panelEl.appendChild(priorityField(node));
  panelEl.appendChild(complexityField(node));
  panelEl.appendChild(authField(node));
  panelEl.appendChild(field('format', 'Format', node.format, 'input'));
  panelEl.appendChild(field('url', 'URL (renvoi externe)', node.url, 'input', 'url'));

  panelEl.appendChild(renderCommentsSection(node.id));
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
  wrap.className = 'fr-select-group';
  const label = document.createElement('label');
  label.className = 'fr-label';
  label.setAttribute('for', 'field-type');
  label.textContent = 'Type';
  wrap.appendChild(label);
  const select = document.createElement('select');
  select.className = 'fr-select';
  select.id = 'field-type';
  for (const [key, def] of Object.entries(TYPES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = def.label;
    if (key === node.type) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    node.type = select.value;
    save(); renderTree();
  });
  wrap.appendChild(select);
  return wrap;
}

function priorityField(node) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-select-group';
  const label = document.createElement('label');
  label.className = 'fr-label';
  label.setAttribute('for', 'field-priority');
  label.textContent = 'Priorité de mise en œuvre';
  wrap.appendChild(label);
  const select = document.createElement('select');
  select.className = 'fr-select';
  select.id = 'field-priority';
  const options = [['', '— non définie —'], ['mvp', 'MVP'], ['v1', 'V1'], ['v2', 'V2'], ['v3', 'V3']];
  for (const [val, txt] of options) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = txt;
    if (val === (node.priority || '')) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    node.priority = select.value;
    save(); renderTree();
  });
  wrap.appendChild(select);
  return wrap;
}

function complexityField(node) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-select-group';
  const label = document.createElement('label');
  label.className = 'fr-label';
  label.setAttribute('for', 'field-complexity');
  label.textContent = 'Niveau de complexité';
  wrap.appendChild(label);
  const select = document.createElement('select');
  select.className = 'fr-select';
  select.id = 'field-complexity';
  const options = [['', '— non défini —'], ['low', 'Faible'], ['medium', 'Moyenne'], ['high', 'Élevée']];
  for (const [val, txt] of options) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = txt;
    if (val === (node.complexity || '')) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    node.complexity = select.value;
    save(); renderTree();
  });
  wrap.appendChild(select);
  return wrap;
}

function authField(node) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-toggle fr-toggle--label-left';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'fr-toggle__input';
  input.id = 'field-auth';
  input.checked = !!node.auth;
  const label = document.createElement('label');
  label.className = 'fr-toggle__label';
  label.setAttribute('for', 'field-auth');
  label.textContent = 'Authentification requise (téléservice, espace privé)';
  input.addEventListener('change', () => {
    node.auth = input.checked;
    save(); renderTree();
  });
  wrap.append(input, label);
  return wrap;
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
    left.appendChild(item);
  }

  async function showRevisionDetail(r) {
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
    const typeLabel = TYPES[node.type]?.label ?? node.type;
    const label = `${escape(node.label)}<br/><i>${escape(typeLabel)}</i>`;
    lines.push(`  ${sid}["${label}"]:::t-${node.type}`);
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

  const h = document.createElement('h2');
  h.className = 'fr-h6';
  h.textContent = title;
  dialog.appendChild(h);

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
      case 'expand-all':
        state.collapsed.clear();
        saveCollapsed(); renderTree();
        break;
      case 'collapse-all': {
        state.collapsed.clear();
        for (const { node } of walk(state.tree)) {
          if ((node.children ?? []).length && node.id !== state.tree.id) state.collapsed.add(node.id);
        }
        saveCollapsed(); renderTree();
        break;
      }
      case 'export-json': exportJson(); break;
      case 'view-graph':  viewGraph(); break;
      case 'view-history': openHistoryDialog(); break;
      case 'import-json':
        document.getElementById('import-file').click();
        break;
      case 'reset':
        if (!defaultTree) { alert('Données par défaut non chargées.'); break; }
        if (confirm('Réinitialiser l\'arborescence aux données par défaut ?\n\nCela crée une nouvelle révision (l\'historique est conservé).')) {
          state.tree = structuredClone(defaultTree);
          state.selectedId = state.tree.id;
          state.collapsed.clear();
          save('Réinitialisation depuis tree.json'); saveCollapsed(); renderTree(); renderPanel();
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

document.getElementById('priority-filter').addEventListener('change', (e) => {
  state.priority = e.target.value;
  renderTree();
});

// ---- Boot ----

async function init() {
  treeEl.innerHTML = '<p class="panel-empty">Chargement de l\'arborescence…</p>';
  // Default tree (used by "Réinitialiser") fetched independently of history.
  try {
    const res = await fetch(DEFAULT_TREE_URL, { cache: 'no-cache' });
    if (res.ok) defaultTree = await res.json();
  } catch { /* non-fatal */ }

  await ensureIdentified();
  renderIdentity();

  try {
    const { tree, revision } = await collab.fetchTree();
    state.tree = tree;
    collab.currentRevisionId = revision.id;
    state.selectedId = tree.id;
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
