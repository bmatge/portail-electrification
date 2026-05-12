// Objectifs editor: pyramide stratégique with N:N links to arborescence nodes.
// Loads objectifs.json + tree.json (for autocomplete and orphan detection).

const STORAGE_KEY = 'portail-electrification.objectifs.v1';
const DATA_URL = 'assets/data/objectifs.json';
const TREE_URL = 'assets/data/tree.json';

const state = {
  data: null,
  treeIndex: new Map(),    // id → { id, label, type }
  collapsed: new Set(),    // ids of collapsed axes/objectives
  search: '',
};

const rootEl = document.getElementById('objectifs-root');

// ---- Persistence ----

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

// ---- Tree index for autocomplete ----

function indexTree(node, out = new Map()) {
  out.set(node.id, { id: node.id, label: node.label });
  for (const c of node.children ?? []) indexTree(c, out);
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
  const split = document.createElement('div');
  split.className = 'fr-grid-row fr-grid-row--gutters';
  split.innerHTML = '';

  const left = document.createElement('section');
  left.className = 'fr-col-12 fr-col-lg-8';
  left.appendChild(renderHeader());
  left.appendChild(renderPyramid());
  split.appendChild(left);

  const right = document.createElement('section');
  right.className = 'fr-col-12 fr-col-lg-4';
  right.appendChild(renderCoverage());
  split.appendChild(right);

  rootEl.appendChild(split);
}

function renderToolbar() {
  const wrap = document.createElement('section');
  wrap.className = 'fr-mb-2w';
  wrap.innerHTML = `
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-arrow-down-s-line" data-objectif-action="expand-all">Tout déplier</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-arrow-right-s-line" data-objectif-action="collapse-all">Tout replier</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-download-line" data-objectif-action="export">Export</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-upload-line" data-objectif-action="import">Import</button></li>
      <li><button type="button" class="fr-btn fr-btn--tertiary fr-icon-refresh-line" data-objectif-action="reset">Réinitialiser</button></li>
      <input type="file" id="objectifs-import-file" accept=".json" hidden>
    </ul>
  `;
  wrap.querySelector('[data-objectif-action="expand-all"]').addEventListener('click', () => {
    state.collapsed.clear(); render();
  });
  wrap.querySelector('[data-objectif-action="collapse-all"]').addEventListener('click', () => {
    state.collapsed.clear();
    for (const a of state.data.axes) {
      state.collapsed.add(a.id);
      for (const o of a.objectives) state.collapsed.add(o.id);
    }
    render();
  });
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

function renderHeader() {
  const div = document.createElement('div');
  div.className = 'fr-callout fr-mb-3w';

  const promise = document.createElement('p');
  promise.className = 'fr-callout__title fr-text--lg';
  promise.textContent = state.data.meta.promise;
  div.appendChild(promise);

  const subtitle = document.createElement('p');
  subtitle.className = 'fr-callout__text fr-text--sm';
  subtitle.style.fontStyle = 'italic';
  subtitle.textContent = state.data.meta.subtitle;
  div.appendChild(subtitle);

  // Calendar baseline: pill (slice) + text (échéance)
  const cal = state.data.meta.calendrier;
  if (Array.isArray(cal) && cal.length) {
    const calWrap = document.createElement('div');
    calWrap.className = 'objectifs-calendar';
    const label = document.createElement('span');
    label.className = 'objectifs-calendar__label';
    label.textContent = 'Calendrier :';
    calWrap.appendChild(label);
    for (const slice of cal) {
      const item = document.createElement('span');
      item.className = 'objectifs-calendar__item';
      item.innerHTML = `<span class="priority-pill ${escape(slice.id)}">${escape(slice.label)}</span> <span class="objectifs-calendar__date">${escape(slice.echeance)}</span>`;
      calWrap.appendChild(item);
    }
    div.appendChild(calWrap);
  }

  return div;
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
  title.innerHTML = `<span class="objectif-id">${escape(axe.id)}</span> ${escape(axe.name)}`;
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
  title.innerHTML = `<span class="objectif-id">${escape(obj.id)}</span> ${escape(obj.name)}`;
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
  const card = document.createElement('article');
  card.className = 'objectif-mean';

  const head = document.createElement('div');
  head.className = 'objectif-mean__head';
  head.innerHTML = `<span class="objectif-id">${escape(mean.id)}</span> ${escape(mean.text)}`;
  card.appendChild(head);

  // Linked nodes
  const nodes = document.createElement('div');
  nodes.className = 'objectif-mean__nodes';
  const labelEl = document.createElement('span');
  labelEl.className = 'objectif-mean__label';
  labelEl.textContent = 'Couvre :';
  nodes.appendChild(labelEl);
  for (const nodeId of mean.nodes || []) {
    nodes.appendChild(renderNodeBadge(mean, nodeId));
  }
  nodes.appendChild(renderAddButton(mean));
  card.appendChild(nodes);

  return card;
}

function renderNodeBadge(mean, nodeId) {
  const node = state.treeIndex.get(nodeId);
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = node ? 'node-link-badge' : 'node-link-badge node-link-badge--unknown';
  badge.title = node ? `${node.label} (${nodeId}) — cliquer pour retirer` : `${nodeId} introuvable — cliquer pour retirer`;
  badge.innerHTML = `<span class="badge-id">${escape(nodeId)}</span> <span class="badge-label">${escape(node ? node.label : '?')}</span> <span class="badge-x">×</span>`;
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
  const wrap = document.createElement('div');
  wrap.className = 'panel-card';
  wrap.innerHTML = '<h3 class="fr-h6 fr-mb-2w">Lacunes</h3>';

  const coverage = meansByNode();
  const orphans = orphanNodes();
  const unknown = unknownNodeRefs();

  const sec1 = document.createElement('div');
  sec1.className = 'fr-mb-3w';
  sec1.innerHTML = `<p class="fr-text--sm fr-mb-1w"><strong>${orphans.length}</strong> nœud${orphans.length > 1 ? 's' : ''} d'arborescence sans moyen rattaché :</p>`;
  if (orphans.length === 0) {
    sec1.innerHTML += '<p class="fr-text--xs panel-empty" style="margin:0;">Aucun — tous les nœuds sont couverts.</p>';
  } else {
    const ul = document.createElement('ul');
    ul.className = 'orphan-list';
    for (const n of orphans) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="badge-id">${escape(n.id)}</span> ${escape(n.label)}`;
      ul.appendChild(li);
    }
    sec1.appendChild(ul);
  }
  wrap.appendChild(sec1);

  if (unknown.length > 0) {
    const sec2 = document.createElement('div');
    sec2.className = 'fr-mb-3w';
    sec2.innerHTML = `<p class="fr-text--sm fr-mb-1w"><strong>${unknown.length}</strong> référence${unknown.length > 1 ? 's' : ''} de nœud introuvable${unknown.length > 1 ? 's' : ''} :</p>`;
    const ul = document.createElement('ul');
    ul.className = 'orphan-list';
    for (const u of unknown) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="badge-id">${escape(u.meanId)}</span> → <span class="badge-id badge-id--err">${escape(u.nodeId)}</span>`;
      ul.appendChild(li);
    }
    sec2.appendChild(ul);
    wrap.appendChild(sec2);
  }

  // Synthèse chiffrée
  const totalMeans = allMeans().length;
  const totalLinks = allMeans().reduce((s, m) => s + (m.nodes?.length || 0), 0);
  const summary = document.createElement('div');
  summary.className = 'fr-text--xs';
  summary.style.color = 'var(--text-mention-grey, #666)';
  summary.innerHTML = `
    <p style="margin:0.25rem 0;">${state.data.axes.length} axes · ${state.data.axes.reduce((s, a) => s + a.objectives.length, 0)} objectifs · ${totalMeans} moyens.</p>
    <p style="margin:0.25rem 0;">${totalLinks} liaisons vers ${coverage.size} nœud${coverage.size > 1 ? 's' : ''}.</p>
  `;
  wrap.appendChild(summary);

  return wrap;
}

// ---- Utils ----

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
    const [data, tree] = await Promise.all([
      load() ? Promise.resolve(load()) : fetchJSON(DATA_URL),
      fetchJSON(TREE_URL),
    ]);
    state.data = data;
    state.treeIndex = indexTree(tree);
  } catch (e) {
    rootEl.innerHTML = `<p class="panel-empty">Impossible de charger : ${e.message}. Servez le projet via un serveur HTTP.</p>`;
    return;
  }
  render();
}

init();
