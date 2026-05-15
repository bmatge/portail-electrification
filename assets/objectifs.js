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
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-download-line" data-objectif-action="export">Export</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-upload-line" data-objectif-action="import">Import</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-refresh-line" data-objectif-action="reset">Réinitialiser</button></li>
      <input type="file" id="objectifs-import-file" accept=".json" hidden>
    </ul>
  `;
  wrap.querySelector('[data-objectif-action="export"]').addEventListener('click', exportJson);
  wrap.querySelector('[data-objectif-action="import"]').addEventListener('click', () => {
    document.getElementById('objectifs-import-file').click();
  });
  wrap.querySelector('[data-objectif-action="reset"]').addEventListener('click', () => {
    if (!confirm('Réinitialiser la pyramide aux données par défaut ?')) return;
    fetchJSON(DATA_URL).then(d => { state.data = d; save(); render(); });
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
  for (const axe of state.data.axes) {
    wrap.appendChild(renderAxe(axe));
  }
  return wrap;
}

function renderAxe(axe) {
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
  const title = document.createElement('h3');
  title.className = 'objectif-axe__title';
  title.innerHTML = `<span class="kind-badge kind-badge--axe" title="${escape(axe.id)}">Axe</span> ${escape(axe.name)}`;
  head.append(toggle, title);
  card.appendChild(head);

  if (axe.description) {
    const p = document.createElement('p');
    p.className = 'objectif-axe__desc';
    p.textContent = axe.description;
    card.appendChild(p);
  }

  if (!collapsed) {
    for (const obj of axe.objectives) {
      card.appendChild(renderObjective(obj));
    }
  }
  return card;
}

function renderObjective(obj) {
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
  const title = document.createElement('h4');
  title.className = 'objectif-objective__title';
  title.innerHTML = `<span class="kind-badge kind-badge--objective" title="${escape(obj.id)}">Objectif</span> ${escape(obj.name)}`;
  head.append(toggle, title);
  wrap.appendChild(head);

  if (!collapsed) {
    const list = document.createElement('div');
    list.className = 'objectif-means';
    for (const mean of obj.means) {
      if (!meanMatches(mean)) continue;
      list.appendChild(renderMean(mean));
    }
    wrap.appendChild(list);
  }
  return wrap;
}

function renderMean(mean) {
  const row = document.createElement('article');
  row.className = 'objectif-mean';

  const kind = document.createElement('span');
  kind.className = 'kind-badge kind-badge--mean';
  kind.textContent = 'Moyen';
  kind.title = mean.id;
  row.appendChild(kind);

  const text = document.createElement('span');
  text.className = 'objectif-mean__text';
  text.textContent = mean.text;
  row.appendChild(text);

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
