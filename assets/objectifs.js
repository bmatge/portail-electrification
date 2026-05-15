// Objectifs editor: pyramide stratégique with N:N links to arborescence nodes.
// Server-backed: collab.fetchData('objectifs') + collab.fetchTree() — scoped projet.

import { collab, ensureIdentified } from './collab.js';

const state = {
  data: null,
  treeIndex: new Map(),    // id → { id, label, type }
  collapsed: new Set(),    // ids of collapsed axes/objectives
  search: '',
};

const rootEl = document.getElementById('objectifs-root');

// ---- Persistence (server-backed, debounced) ----

let saveTimer = null;
let inFlight = false;
let pendingSave = false;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
}
async function flushSave() {
  if (inFlight) { pendingSave = true; return; }
  inFlight = true;
  pendingSave = false;
  try {
    await collab.saveData('objectifs', state.data);
  } catch (e) {
    if (e.status === 401) {
      await ensureIdentified();
      try { await collab.saveData('objectifs', state.data); }
      catch (e2) { alert('Erreur enregistrement : ' + e2.message); }
    } else {
      alert('Erreur enregistrement : ' + e.message);
    }
  } finally {
    inFlight = false;
    if (pendingSave) flushSave();
  }
}

// ---- ID generation ----
//
// IDs are opaque to the data model. Existing seed data uses semantic prefixes
// (a1-axe, o2-orient, m3-marketplace) but new items just need to be unique
// inside the project. Random suffix is enough.
const newId = (prefix) => prefix + '-' + Math.random().toString(36).slice(2, 8);
const newAxeId       = () => newId('a');
const newObjectiveId = () => newId('o');
const newMeanId      = () => newId('m');

// ---- CRUD on the pyramid ----

function addAxe() {
  state.data.axes.push({
    id: newAxeId(),
    name: 'Nouvel axe',
    description: '',
    objectives: [],
  });
  save(); render();
}

function addObjective(axe) {
  axe.objectives.push({
    id: newObjectiveId(),
    name: 'Nouvel objectif',
    means: [],
  });
  state.collapsed.delete(axe.id); // keep the axe expanded so the user sees the new objective
  save(); render();
}

function addMean(objective) {
  objective.means.push({
    id: newMeanId(),
    text: 'Nouveau moyen',
    nodes: [],
  });
  state.collapsed.delete(objective.id);
  save(); render();
}

function removeAxe(axeId) {
  const axe = state.data.axes.find(a => a.id === axeId);
  if (!axe) return;
  const meanCount = axe.objectives.reduce((s, o) => s + o.means.length, 0);
  const objCount = axe.objectives.length;
  let msg = `Supprimer l'axe « ${axe.name} » ?`;
  if (objCount || meanCount) msg += `\n\n${objCount} objectif${objCount > 1 ? 's' : ''} et ${meanCount} moyen${meanCount > 1 ? 's' : ''} seront aussi supprimés.`;
  if (!confirm(msg)) return;
  state.data.axes = state.data.axes.filter(a => a.id !== axeId);
  save(); render();
}

function removeObjective(axe, objectiveId) {
  const obj = axe.objectives.find(o => o.id === objectiveId);
  if (!obj) return;
  let msg = `Supprimer l'objectif « ${obj.name} » ?`;
  if (obj.means.length) msg += `\n\n${obj.means.length} moyen${obj.means.length > 1 ? 's' : ''} seront aussi supprimés.`;
  if (!confirm(msg)) return;
  axe.objectives = axe.objectives.filter(o => o.id !== objectiveId);
  save(); render();
}

function removeMean(objective, meanId) {
  const mean = objective.means.find(m => m.id === meanId);
  if (!mean) return;
  if (!confirm(`Supprimer le moyen « ${mean.text} » ?`)) return;
  objective.means = objective.means.filter(m => m.id !== meanId);
  save(); render();
}

// Reorder helper: moves the item at index `idx` by `dir` (-1 or +1) within `arr`.
function move(arr, idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  save(); render();
}

// ---- Inline editing ----
//
// Renders a label that becomes an <input> on click. On Enter or blur, commits
// the new value via `onCommit(newValue)`. On Escape, restores the original.
// `onCommit` is responsible for persistence (save) and re-render.
function editableLabel({ value, onCommit, className = '', placeholder = '', textarea = false, ariaLabel = '' }) {
  const wrap = document.createElement('span');
  wrap.className = 'editable-label ' + className;

  const display = document.createElement('span');
  display.className = 'editable-label__display';
  display.textContent = value || placeholder || '—';
  if (!value) display.classList.add('editable-label__display--empty');
  display.title = 'Cliquer pour modifier';

  display.addEventListener('click', () => {
    const input = textarea ? document.createElement('textarea') : document.createElement('input');
    input.className = 'fr-input fr-input--sm editable-label__input';
    if (!textarea) input.type = 'text';
    if (textarea) input.rows = 2;
    input.value = value || '';
    input.placeholder = placeholder || '';
    if (ariaLabel) input.setAttribute('aria-label', ariaLabel);

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const next = input.value.trim();
      onCommit(next);
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      render();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !textarea) { e.preventDefault(); commit(); }
      else if (e.key === 'Enter' && textarea && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    wrap.replaceChild(input, display);
    input.focus();
    if (!textarea) input.select();
  });

  wrap.appendChild(display);
  return wrap;
}

// Small icon button (matches the style used in maquette.js).
function iconBtn(label, title, onClick, { disabled = false } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'objectif-icon-btn';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.disabled = !!disabled;
  if (!disabled) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

// ---- Tree index for autocomplete ----

function indexTree(node, out = new Map(), depth = 0) {
  const types = Array.isArray(node.types) && node.types.length
    ? node.types
    : (node.type ? [node.type] : []);
  out.set(node.id, {
    id: node.id,
    label: node.label,
    type: types[0] || 'editorial',
    deadline: node.deadline || '',
    depth,
  });
  for (const c of node.children ?? []) indexTree(c, out, depth + 1);
  return out;
}

// ---- Helpers ----

const allMeans = () => state.data.axes.flatMap(a => a.objectives.flatMap(o => o.means));

function meansByNode() {
  // Map nodeId → list of mean ids covering it.
  const m = new Map();
  for (const mean of allMeans()) {
    for (const nodeId of mean.nodes ?? []) {
      if (!m.has(nodeId)) m.set(nodeId, []);
      m.get(nodeId).push(mean.id);
    }
  }
  return m;
}

function orphanNodes() {
  const covered = meansByNode();
  return [...state.treeIndex.values()].filter(n => !covered.has(n.id));
}

function unknownNodeRefs() {
  // Mean references to node IDs that don't exist in the tree.
  const refs = [];
  for (const mean of allMeans()) {
    for (const id of mean.nodes ?? []) {
      if (!state.treeIndex.has(id)) refs.push({ meanId: mean.id, nodeId: id });
    }
  }
  return refs;
}

// ---- Search ----

function meanMatches(mean) {
  const t = state.search.trim().toLowerCase();
  if (!t) return true;
  return mean.id.toLowerCase().includes(t) ||
    mean.text.toLowerCase().includes(t) ||
    (mean.nodes || []).some(n => n.toLowerCase().includes(t));
}

// ---- Rendering ----

function render() {
  rootEl.innerHTML = '';
  rootEl.appendChild(renderToolbar());
  rootEl.appendChild(renderSearch());
  rootEl.appendChild(renderIntro());
  rootEl.appendChild(renderPyramid());
  rootEl.appendChild(renderCoverage());
}

function renderToolbar() {
  const wrap = document.createElement('section');
  wrap.className = 'fr-mb-2w';
  wrap.innerHTML = `
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
      <li><button type="button" class="fr-btn fr-btn--secondary fr-icon-add-line" data-objectif-action="add-axe">Ajouter un axe</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-download-line" data-objectif-action="export">Export</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-upload-line" data-objectif-action="import">Import</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-delete-line" data-objectif-action="clear">Vider la pyramide</button></li>
      <input type="file" id="objectifs-import-file" accept=".json" hidden>
    </ul>
  `;
  wrap.querySelector('[data-objectif-action="add-axe"]').addEventListener('click', addAxe);
  wrap.querySelector('[data-objectif-action="export"]').addEventListener('click', exportJson);
  wrap.querySelector('[data-objectif-action="import"]').addEventListener('click', () => {
    document.getElementById('objectifs-import-file').click();
  });
  wrap.querySelector('[data-objectif-action="clear"]').addEventListener('click', () => {
    const total = (state.data.axes || []).length;
    if (total === 0) return;
    if (!confirm(`Vider la pyramide ? ${total} axe${total > 1 ? 's' : ''} et tout leur contenu seront supprimés. L'opération est réversible via l'historique de saisie de votre navigateur uniquement si vous n'enregistrez rien d'autre.`)) return;
    state.data = { axes: [], meta: state.data.meta || {} };
    save(); render();
  });
  wrap.querySelector('#objectifs-import-file').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.axes)) throw new Error('Format invalide');
        state.data = parsed; save(); render();
      } catch (err) {
        alert('Import impossible : ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  return wrap;
}

function renderSearch() {
  const wrap = document.createElement('div');
  wrap.className = 'fr-input-group fr-mb-2w';
  wrap.innerHTML = `
    <label class="fr-label" for="objectif-search">Rechercher dans la pyramide</label>
    <input class="fr-input" type="search" id="objectif-search" placeholder="ex. leasing, iframe, marketplace…" value="${escape(state.search)}">
  `;
  const input = wrap.querySelector('input');
  input.addEventListener('input', () => { state.search = input.value; render(); input.focus(); });
  return wrap;
}

function renderIntro() {
  const meta = state.data.meta || {};
  const wrap = document.createElement('section');
  wrap.className = 'objectifs-intro fr-mb-3w';
  const promise = document.createElement('p');
  promise.className = 'objectifs-intro__promise';
  promise.textContent = meta.promise || '';
  wrap.appendChild(promise);
  if (meta.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'objectifs-intro__subtitle';
    sub.textContent = meta.subtitle;
    wrap.appendChild(sub);
  }
  return wrap;
}

function renderPyramid() {
  const wrap = document.createElement('div');
  wrap.className = 'objectifs-tree';
  const axes = state.data.axes || [];
  if (axes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'panel-empty';
    empty.textContent = 'La pyramide est vide. Cliquez sur « Ajouter un axe » dans la barre d\'outils pour commencer.';
    wrap.appendChild(empty);
    return wrap;
  }
  axes.forEach((axe, idx) => {
    wrap.appendChild(renderAxe(axe, idx, axes.length));
  });
  return wrap;
}

function renderAxe(axe, idx, total) {
  const collapsed = state.collapsed.has(axe.id);
  const card = document.createElement('section');
  card.className = 'objectif-axe';

  const head = document.createElement('header');
  head.className = 'objectif-axe__head';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'objectif-toggle';
  toggle.textContent = collapsed ? '▸' : '▾';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.addEventListener('click', () => {
    if (collapsed) state.collapsed.delete(axe.id); else state.collapsed.add(axe.id);
    render();
  });

  const titleWrap = document.createElement('div');
  titleWrap.className = 'objectif-axe__title';
  const badge = document.createElement('span');
  badge.className = 'kind-badge kind-badge--axe';
  badge.textContent = 'Axe';
  badge.title = axe.id;
  titleWrap.appendChild(badge);
  titleWrap.appendChild(editableLabel({
    value: axe.name,
    placeholder: '(axe sans nom)',
    ariaLabel: 'Nom de l\'axe',
    onCommit: (v) => { axe.name = v || 'Axe sans nom'; save(); render(); },
  }));

  const tools = document.createElement('div');
  tools.className = 'objectif-tools';
  tools.appendChild(iconBtn('↑', 'Monter cet axe', () => move(state.data.axes, idx, -1), { disabled: idx === 0 }));
  tools.appendChild(iconBtn('↓', 'Descendre cet axe', () => move(state.data.axes, idx, +1), { disabled: idx === total - 1 }));
  tools.appendChild(iconBtn('×', 'Supprimer cet axe', () => removeAxe(axe.id)));

  head.append(toggle, titleWrap, tools);
  card.appendChild(head);

  // Description : éditable inline (textarea), placeholder cliquable si vide.
  const desc = editableLabel({
    value: axe.description || '',
    placeholder: '+ Ajouter une description',
    className: 'objectif-axe__desc',
    textarea: true,
    ariaLabel: 'Description de l\'axe',
    onCommit: (v) => { axe.description = v; save(); render(); },
  });
  card.appendChild(desc);

  if (!collapsed) {
    axe.objectives.forEach((obj, oIdx) => {
      card.appendChild(renderObjective(obj, axe, oIdx, axe.objectives.length));
    });
    const addObj = document.createElement('button');
    addObj.type = 'button';
    addObj.className = 'objectif-add objectif-add--objective';
    addObj.textContent = '+ Ajouter un objectif';
    addObj.addEventListener('click', () => addObjective(axe));
    card.appendChild(addObj);
  }
  return card;
}

function renderObjective(obj, axe, idx, total) {
  const collapsed = state.collapsed.has(obj.id);
  const wrap = document.createElement('div');
  wrap.className = 'objectif-objective';

  const head = document.createElement('div');
  head.className = 'objectif-objective__head';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'objectif-toggle';
  toggle.textContent = collapsed ? '▸' : '▾';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.addEventListener('click', () => {
    if (collapsed) state.collapsed.delete(obj.id); else state.collapsed.add(obj.id);
    render();
  });

  const titleWrap = document.createElement('div');
  titleWrap.className = 'objectif-objective__title';
  const badge = document.createElement('span');
  badge.className = 'kind-badge kind-badge--objective';
  badge.textContent = 'Objectif';
  badge.title = obj.id;
  titleWrap.appendChild(badge);
  titleWrap.appendChild(editableLabel({
    value: obj.name,
    placeholder: '(objectif sans nom)',
    ariaLabel: 'Nom de l\'objectif',
    onCommit: (v) => { obj.name = v || 'Objectif sans nom'; save(); render(); },
  }));

  const tools = document.createElement('div');
  tools.className = 'objectif-tools';
  tools.appendChild(iconBtn('↑', 'Monter cet objectif', () => move(axe.objectives, idx, -1), { disabled: idx === 0 }));
  tools.appendChild(iconBtn('↓', 'Descendre cet objectif', () => move(axe.objectives, idx, +1), { disabled: idx === total - 1 }));
  tools.appendChild(iconBtn('×', 'Supprimer cet objectif', () => removeObjective(axe, obj.id)));

  head.append(toggle, titleWrap, tools);
  wrap.appendChild(head);

  if (!collapsed) {
    const list = document.createElement('div');
    list.className = 'objectif-means';
    obj.means.forEach((mean, mIdx) => {
      if (!meanMatches(mean)) return;
      list.appendChild(renderMean(mean, obj, mIdx, obj.means.length));
    });
    wrap.appendChild(list);

    const addMeanBtn = document.createElement('button');
    addMeanBtn.type = 'button';
    addMeanBtn.className = 'objectif-add objectif-add--mean';
    addMeanBtn.textContent = '+ Ajouter un moyen';
    addMeanBtn.addEventListener('click', () => addMean(obj));
    wrap.appendChild(addMeanBtn);
  }
  return wrap;
}

function renderMean(mean, objective, idx, total) {
  const row = document.createElement('article');
  row.className = 'objectif-mean';

  const kind = document.createElement('span');
  kind.className = 'kind-badge kind-badge--mean';
  kind.textContent = 'Moyen';
  kind.title = mean.id;
  row.appendChild(kind);

  row.appendChild(editableLabel({
    value: mean.text,
    placeholder: '(moyen sans description)',
    className: 'objectif-mean__text',
    ariaLabel: 'Description du moyen',
    onCommit: (v) => { mean.text = v || 'Moyen sans description'; save(); render(); },
  }));

  const tools = document.createElement('div');
  tools.className = 'objectif-tools objectif-tools--mean';
  tools.appendChild(iconBtn('↑', 'Monter ce moyen', () => move(objective.means, idx, -1), { disabled: idx === 0 }));
  tools.appendChild(iconBtn('↓', 'Descendre ce moyen', () => move(objective.means, idx, +1), { disabled: idx === total - 1 }));
  tools.appendChild(iconBtn('×', 'Supprimer ce moyen', () => removeMean(objective, mean.id)));
  row.appendChild(tools);

  const nodes = document.createElement('div');
  nodes.className = 'objectif-mean__nodes';
  for (const nodeId of mean.nodes || []) {
    nodes.appendChild(renderNodeBadge(mean, nodeId));
  }
  nodes.appendChild(renderAddButton(mean));
  row.appendChild(nodes);

  return row;
}

function renderNodeBadge(mean, nodeId) {
  const node = state.treeIndex.get(nodeId);
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = node
    ? `node-link-badge node-link-badge--typed type-${node.type}`
    : 'node-link-badge node-link-badge--unknown';
  badge.title = node
    ? `${node.label} (${nodeId}) — niveau ${node.depth} — cliquer pour retirer`
    : `${nodeId} introuvable — cliquer pour retirer`;
  const levelText = node ? `L${node.depth}` : '?';
  badge.innerHTML = `<span class="badge-level">${escape(levelText)}</span> <span class="badge-label">${escape(node ? node.label : nodeId)}</span> <span class="badge-x">×</span>`;
  badge.addEventListener('click', () => {
    mean.nodes = (mean.nodes || []).filter(id => id !== nodeId);
    save(); render();
  });
  return badge;
}

function renderAddButton(mean) {
  const wrap = document.createElement('span');
  wrap.className = 'add-link';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-link__btn fr-btn fr-btn--tertiary fr-btn--sm';
  btn.textContent = '+ lier un nœud';
  wrap.appendChild(btn);

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input add-link__input';
    input.placeholder = 'rechercher un nœud par libellé ou id…';
    input.autofocus = true;
    const dropdown = document.createElement('ul');
    dropdown.className = 'add-link__dropdown';
    wrap.append(input, dropdown);
    input.focus();

    function refresh() {
      const term = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      if (!term) return;
      const already = new Set(mean.nodes || []);
      const matches = [...state.treeIndex.values()]
        .filter(n => !already.has(n.id) && (n.label.toLowerCase().includes(term) || n.id.toLowerCase().includes(term)))
        .slice(0, 8);
      for (const n of matches) {
        const li = document.createElement('li');
        li.className = 'add-link__option';
        li.innerHTML = `<span class="badge-id">${escape(n.id)}</span> ${escape(n.label)}`;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (!mean.nodes) mean.nodes = [];
          mean.nodes.push(n.id);
          save(); render();
        });
        dropdown.appendChild(li);
      }
    }
    input.addEventListener('input', refresh);
    input.addEventListener('blur', () => setTimeout(() => render(), 150));
  });
  return wrap;
}

function renderCoverage() {
  const wrap = document.createElement('section');
  wrap.className = 'objectifs-coverage';

  const heading = document.createElement('h2');
  heading.className = 'fr-h5 objectifs-coverage__title';
  heading.textContent = 'Lacunes';
  wrap.appendChild(heading);

  const coverage = meansByNode();
  const orphans = orphanNodes();
  const unknown = unknownNodeRefs();

  // Synthèse chiffrée en tête de section (compact, en chips).
  const totalMeans = allMeans().length;
  const totalObj = state.data.axes.reduce((s, a) => s + a.objectives.length, 0);
  const totalLinks = allMeans().reduce((s, m) => s + (m.nodes?.length || 0), 0);
  const summary = document.createElement('div');
  summary.className = 'objectifs-coverage__summary';
  summary.innerHTML = `
    <span class="roadmap-stat"><strong>${state.data.axes.length}</strong> axes</span>
    <span class="roadmap-stat"><strong>${totalObj}</strong> objectifs</span>
    <span class="roadmap-stat"><strong>${totalMeans}</strong> moyens</span>
    <span class="roadmap-stat"><strong>${totalLinks}</strong> liaisons</span>
    <span class="roadmap-stat"><strong>${coverage.size}</strong> nœuds couverts</span>
  `;
  wrap.appendChild(summary);

  // Nœuds orphelins
  const sec1 = document.createElement('div');
  sec1.className = 'objectifs-coverage__block';
  sec1.innerHTML = `<h3 class="fr-h6">${orphans.length} nœud${orphans.length > 1 ? 's' : ''} sans moyen rattaché</h3>`;
  if (orphans.length === 0) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Aucun — tous les nœuds sont couverts.';
    sec1.appendChild(p);
  } else {
    const list = document.createElement('div');
    list.className = 'objectifs-coverage__list';
    for (const n of orphans) {
      const badge = document.createElement('span');
      badge.className = `node-link-badge node-link-badge--typed type-${n.type || 'editorial'}`;
      badge.title = `${n.label} (${n.id}) — niveau ${n.depth}`;
      badge.innerHTML = `<span class="badge-level">L${n.depth}</span> <span class="badge-label">${escape(n.label)}</span>`;
      list.appendChild(badge);
    }
    sec1.appendChild(list);
  }
  wrap.appendChild(sec1);

  // Références introuvables
  if (unknown.length > 0) {
    const sec2 = document.createElement('div');
    sec2.className = 'objectifs-coverage__block';
    sec2.innerHTML = `<h3 class="fr-h6">${unknown.length} référence${unknown.length > 1 ? 's' : ''} de nœud introuvable${unknown.length > 1 ? 's' : ''}</h3>`;
    const list = document.createElement('div');
    list.className = 'objectifs-coverage__list';
    for (const u of unknown) {
      const item = document.createElement('span');
      item.className = 'objectifs-coverage__unknown';
      item.innerHTML = `<span class="badge-id">${escape(u.meanId)}</span> → <span class="badge-id badge-id--err">${escape(u.nodeId)}</span>`;
      list.appendChild(item);
    }
    sec2.appendChild(list);
    wrap.appendChild(sec2);
  }

  return wrap;
}

// ---- Utils ----

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'objectifs.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Boot ----

async function init() {
  if (!rootEl) return;
  rootEl.innerHTML = '<p class="panel-empty">Chargement de la pyramide stratégique…</p>';
  try {
    const [{ data }, { tree }] = await Promise.all([
      collab.fetchData('objectifs'),
      collab.fetchTree(),
    ]);
    state.data = data || { axes: [], objectifs: [], moyens: [] };
    state.treeIndex = indexTree(tree);
  } catch (e) {
    rootEl.innerHTML = `<p class="panel-empty">Impossible de charger : ${e.message}.</p>`;
    return;
  }
  render();
}

init();
