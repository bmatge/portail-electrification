// Tree editor for the hub d'info arborescence.
// Data is preloaded from the cadrage note; persisted in localStorage.

const STORAGE_KEY = 'portail-electrification.tree.v1';
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
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tree));
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
  return { id: newId(), label, type: 'editorial', format: '', tldr: '', url: '', priority: '', children: [] };
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

  const id = document.createElement('p');
  id.className = 'panel-id';
  id.textContent = `id : ${node.id}`;
  panelEl.appendChild(id);

  panelEl.appendChild(field('label', 'Libellé', node.label, 'input'));
  panelEl.appendChild(typeField(node));
  panelEl.appendChild(priorityField(node));
  panelEl.appendChild(field('format', 'Format', node.format, 'input'));
  panelEl.appendChild(field('url', 'URL (renvoi externe)', node.url, 'input', 'url'));
  panelEl.appendChild(field('tldr', 'TL;DR', node.tldr, 'textarea'));

  const actions = document.createElement('div');
  actions.className = 'panel-actions';

  const addChild = button('+ Enfant', 'fr-btn--secondary fr-icon-add-line', () => {
    const child = makeNode();
    node.children.push(child);
    state.collapsed.delete(node.id);
    state.selectedId = child.id;
    save(); saveCollapsed(); renderTree(); renderPanel();
  });
  actions.appendChild(addChild);

  if (parent) {
    const del = button('Supprimer', 'fr-btn--tertiary fr-icon-delete-line', () => {
      if (!confirm(`Supprimer « ${node.label} » et toute sa descendance ?`)) return;
      parent.children = parent.children.filter(c => c.id !== node.id);
      state.selectedId = parent.id;
      save(); renderTree(); renderPanel();
    });
    actions.appendChild(del);

    const moveUp = button('↑', 'fr-btn--tertiary', () => moveSibling(parent, node, -1));
    const moveDown = button('↓', 'fr-btn--tertiary', () => moveSibling(parent, node, +1));
    actions.appendChild(moveUp);
    actions.appendChild(moveDown);
  }

  panelEl.appendChild(actions);
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

function button(text, classes, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `fr-btn ${classes}`;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// ---- Exports ----

function exportJson() {
  showExport('Export JSON', JSON.stringify(state.tree, null, 2), 'arborescence.json', 'application/json');
}

function exportMarkdown() {
  const lines = ['# Arborescence — Hub d\'info Plan d\'électrification', ''];
  function rec(node, depth) {
    const indent = '  '.repeat(depth);
    const typeLabel = TYPES[node.type]?.label ?? node.type;
    const pri = node.priority ? ` [${PRIORITIES[node.priority]}]` : '';
    lines.push(`${indent}- **${node.label}** \`${typeLabel}\`${pri}${node.format ? ` — *${node.format}*` : ''}`);
    if (node.tldr) lines.push(`${indent}  > ${node.tldr}`);
    if (node.url)  lines.push(`${indent}  > Lien : <${node.url}>`);
    for (const c of node.children ?? []) rec(c, depth + 1);
  }
  rec(state.tree, 0);
  showExport('Export Markdown', lines.join('\n'), 'arborescence.md', 'text/markdown');
}

function exportMermaid() {
  const lines = ['flowchart TD'];
  function safeId(id) { return id.replace(/[^a-zA-Z0-9_]/g, '_'); }
  function rec(node) {
    const sid = safeId(node.id);
    const label = `${node.label}\\n[${TYPES[node.type]?.label ?? node.type}]`.replace(/"/g, '\\"');
    lines.push(`  ${sid}["${label}"]`);
    for (const c of node.children ?? []) {
      lines.push(`  ${sid} --> ${safeId(c.id)}`);
      rec(c);
    }
  }
  rec(state.tree);
  showExport('Export Mermaid', lines.join('\n'), 'arborescence.mmd', 'text/plain');
}

function showExport(title, content, filename, mime) {
  let dlg = document.getElementById('export-dialog');
  if (dlg) dlg.remove();
  dlg = document.createElement('dialog');
  dlg.id = 'export-dialog';
  dlg.className = 'export-dialog';

  const h = document.createElement('h2');
  h.className = 'fr-h6';
  h.textContent = title;
  dlg.appendChild(h);

  const ta = document.createElement('textarea');
  ta.className = 'export-textarea';
  ta.value = content;
  ta.readOnly = true;
  dlg.appendChild(ta);

  const actions = document.createElement('div');
  actions.className = 'panel-actions';

  actions.appendChild(button('Copier', 'fr-btn--secondary fr-icon-clipboard-line', async () => {
    try { await navigator.clipboard.writeText(content); } catch { ta.select(); document.execCommand('copy'); }
  }));
  actions.appendChild(button('Télécharger', 'fr-btn--secondary fr-icon-download-line', () => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }));
  actions.appendChild(button('Fermer', 'fr-btn--tertiary', () => dlg.close()));

  dlg.appendChild(actions);
  document.body.appendChild(dlg);
  dlg.showModal();
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.id || !parsed.label) throw new Error('Format invalide');
      state.tree = parsed;
      state.selectedId = parsed.id;
      save();
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
      case 'export-json':     exportJson(); break;
      case 'export-markdown': exportMarkdown(); break;
      case 'export-mermaid':  exportMermaid(); break;
      case 'import-json':
        document.getElementById('import-file').click();
        break;
      case 'reset':
        if (!defaultTree) { alert('Données par défaut non chargées.'); break; }
        if (confirm('Réinitialiser l\'arborescence aux données par défaut ?')) {
          state.tree = structuredClone(defaultTree);
          state.selectedId = state.tree.id;
          state.collapsed.clear();
          save(); saveCollapsed(); renderTree(); renderPanel();
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
  try {
    const res = await fetch(DEFAULT_TREE_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    defaultTree = await res.json();
  } catch (e) {
    treeEl.innerHTML = `<p class="panel-empty">Impossible de charger ${DEFAULT_TREE_URL} : ${e.message}. Servez le projet via un serveur HTTP (le mode <code>file://</code> bloque <code>fetch</code>).</p>`;
    return;
  }
  state.tree = load() ?? structuredClone(defaultTree);
  renderTree();
  renderPanel();
}

init();
