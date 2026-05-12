// Roadmap editor: 4 slices × 3 actions grid of user stories.
// Server-persisted via /api/roadmap with revision history (similar to script.js).

import { collab, ensureIdentified, escapeHtml, formatDate, renderDiff } from './collab.js';

const DEFAULT_DATA_URL = 'assets/data/roadmap.json';
const TREE_URL = 'assets/data/tree.json';
const DISPOSITIFS_URL = 'assets/data/dispositifs.json';

const STATUS_LABELS = {
  pending:  { label: '— en attente —', cls: 'pending' },
  valide:   { label: '✓ Validé',       cls: 'valide' },
  arbitrer: { label: '? À arbitrer',   cls: 'arbitrer' },
};

const state = {
  data: null,
  defaultData: null,
  treeIndex: new Map(),       // nodeId → { id, label, type }
  dispositifsIndex: new Map(),// dispId  → { id, name, audience, category }
  search: '',
  statusFilter: 'all',
  saveStatus: 'idle',
  saveMessage: '',
};

const boardEl    = document.getElementById('roadmap-board');
const calendarEl = document.getElementById('roadmap-calendar');
const statsEl    = document.getElementById('roadmap-stats');

// ---- Save (debounced) ----

let saveTimer = null;
let inFlight = false;
let pendingSave = false;
let pendingMessage = '';

function save(message = '') {
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
    await collab.saveRoadmap(state.data, msg);
    state.saveStatus = 'saved';
    state.saveMessage = '';
  } catch (e) {
    if (e.status === 409) {
      state.saveStatus = 'conflict';
      state.saveMessage = `Une autre personne a modifié la roadmap (révision #${e.data?.head?.id}).`;
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

function renderStatus() {
  const el = document.getElementById('save-status');
  if (!el) return;
  const map = {
    idle:    '',
    saving:  'Enregistrement…',
    saved:   `Enregistré · révision #${collab.currentRoadmapRevisionId ?? '?'}`,
    error:   `Erreur : ${state.saveMessage}`,
    conflict:`Conflit — ${state.saveMessage}`,
  };
  el.textContent = map[state.saveStatus] ?? '';
  el.className = `save-status save-status--${state.saveStatus}`;
}

// ---- ID generation ----

function nextId() {
  let n = 1;
  const used = new Set(state.data.items.map(i => i.id));
  while (used.has(`rm-${String(n).padStart(3, '0')}`)) n++;
  return `rm-${String(n).padStart(3, '0')}`;
}

// ---- Tree index ----

function indexTree(node, out = new Map()) {
  out.set(node.id, { id: node.id, label: node.label, type: node.type });
  for (const c of node.children ?? []) indexTree(c, out);
  return out;
}

// ---- Filter ----

function itemMatches(item) {
  if (state.statusFilter !== 'all' && item.status !== state.statusFilter) return false;
  const t = state.search.trim().toLowerCase();
  if (!t) return true;
  if (item.id.toLowerCase().includes(t)) return true;
  if (item.story.toLowerCase().includes(t)) return true;
  if ((item.notes || '').toLowerCase().includes(t)) return true;
  for (const n of item.nodes || []) if (n.toLowerCase().includes(t)) return true;
  for (const d of item.dispositifs || []) if (d.toLowerCase().includes(t)) return true;
  return false;
}

// ---- Render: calendar baseline ----

function renderCalendar() {
  calendarEl.innerHTML = '';
  for (const slice of state.data.meta.calendrier) {
    const span = document.createElement('span');
    span.className = `roadmap-calendar__item slice-${slice.id}`;
    span.innerHTML = `
      <span class="priority-pill ${slice.id}">${escapeHtml(slice.label)}</span>
      <span class="roadmap-calendar__date">${escapeHtml(slice.echeance)}</span>
    `;
    calendarEl.appendChild(span);
  }
}

// ---- Render: stats ----

function renderStats() {
  const total = state.data.items.length;
  const valide = state.data.items.filter(i => i.status === 'valide').length;
  const arbitrer = state.data.items.filter(i => i.status === 'arbitrer').length;
  const pending = total - valide - arbitrer;
  statsEl.innerHTML = `
    <span class="roadmap-stat"><strong>${total}</strong> stories</span>
    <span class="roadmap-stat roadmap-stat--valide">✓ <strong>${valide}</strong> validées</span>
    <span class="roadmap-stat roadmap-stat--arbitrer">? <strong>${arbitrer}</strong> à arbitrer</span>
    <span class="roadmap-stat"><strong>${pending}</strong> en attente</span>
  `;
}

// ---- Render: board ----

function renderBoard() {
  boardEl.innerHTML = '';
  const slices = state.data.meta.calendrier;
  const actions = state.data.meta.actions;

  // CSS grid: 1 (action label col) + N slice cols
  boardEl.style.gridTemplateColumns = `160px repeat(${slices.length}, 1fr)`;

  // Top-left empty cell
  const corner = document.createElement('div');
  corner.className = 'roadmap-corner';
  boardEl.appendChild(corner);

  // Slice column headers
  for (const slice of slices) {
    const h = document.createElement('div');
    h.className = `roadmap-col-header slice-${slice.id}`;
    h.innerHTML = `
      <span class="priority-pill ${slice.id}">${escapeHtml(slice.label)}</span>
      <span class="roadmap-col-header__date">${escapeHtml(slice.echeance)}</span>
    `;
    boardEl.appendChild(h);
  }

  // Action rows
  for (const action of actions) {
    const rowHeader = document.createElement('div');
    rowHeader.className = `roadmap-row-header action-${action.id}`;
    rowHeader.innerHTML = `
      <strong>${escapeHtml(action.label)}</strong>
      <div class="roadmap-row-header__desc">${escapeHtml(action.desc)}</div>
    `;
    boardEl.appendChild(rowHeader);

    for (const slice of slices) {
      const cell = document.createElement('div');
      cell.className = `roadmap-cell slice-${slice.id}`;
      cell.dataset.slice = slice.id;
      cell.dataset.action = action.id;

      const items = state.data.items.filter(i => i.slice === slice.id && i.action === action.id);
      let visible = 0;
      for (const item of items) {
        const match = itemMatches(item);
        const card = buildCard(item);
        if (!match) card.classList.add('roadmap-card--hidden');
        else visible++;
        cell.appendChild(card);
      }

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'roadmap-add-btn';
      addBtn.textContent = '+ Ajouter une story';
      addBtn.addEventListener('click', () => addItem(slice.id, action.id));
      cell.appendChild(addBtn);

      boardEl.appendChild(cell);
    }
  }
}

function buildCard(item) {
  const card = document.createElement('article');
  card.className = `roadmap-card roadmap-card--${item.status}`;
  card.dataset.id = item.id;

  // Header line: ID + delete button
  const head = document.createElement('div');
  head.className = 'roadmap-card__head';
  const idEl = document.createElement('span');
  idEl.className = 'roadmap-card__id';
  idEl.textContent = item.id;
  head.appendChild(idEl);
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'roadmap-card__delete';
  del.title = 'Supprimer cette story';
  del.setAttribute('aria-label', 'Supprimer cette story');
  del.textContent = '×';
  del.addEventListener('click', () => {
    if (!confirm(`Supprimer cette story ?\n\n${item.story || '(sans titre)'}`)) return;
    state.data.items = state.data.items.filter(i => i.id !== item.id);
    save(`Suppression story ${item.id}`);
    renderBoard(); renderStats();
  });
  head.appendChild(del);
  card.appendChild(head);

  // Story (textarea)
  const story = document.createElement('textarea');
  story.className = 'roadmap-card__story';
  story.rows = 2;
  story.value = item.story;
  story.placeholder = 'User story…';
  story.addEventListener('input', () => {
    item.story = story.value;
    autosize(story);
    save(`Édition story ${item.id}`);
  });
  card.appendChild(story);

  // Status buttons
  const statusRow = document.createElement('div');
  statusRow.className = 'roadmap-card__status';
  for (const key of ['valide', 'arbitrer']) {
    const meta = STATUS_LABELS[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `roadmap-status-btn ${meta.cls} ${item.status === key ? 'active' : ''}`;
    btn.textContent = meta.label;
    btn.addEventListener('click', () => {
      item.status = item.status === key ? 'pending' : key;
      save(`Statut ${item.id} → ${item.status}`);
      renderBoard(); renderStats();
    });
    statusRow.appendChild(btn);
  }
  card.appendChild(statusRow);

  // Linked nodes
  const nodesRow = document.createElement('div');
  nodesRow.className = 'roadmap-card__links';
  const nodesLabel = document.createElement('span');
  nodesLabel.className = 'roadmap-card__links-label';
  nodesLabel.textContent = 'Arbo :';
  nodesRow.appendChild(nodesLabel);
  for (const nodeId of item.nodes || []) nodesRow.appendChild(renderNodeBadge(item, nodeId));
  nodesRow.appendChild(renderAddNodeBtn(item));
  card.appendChild(nodesRow);

  // Linked dispositifs
  const dispRow = document.createElement('div');
  dispRow.className = 'roadmap-card__links';
  const dispLabel = document.createElement('span');
  dispLabel.className = 'roadmap-card__links-label';
  dispLabel.textContent = 'Disp. :';
  dispRow.appendChild(dispLabel);
  for (const dispId of item.dispositifs || []) dispRow.appendChild(renderDispBadge(item, dispId));
  dispRow.appendChild(renderAddDispBtn(item));
  card.appendChild(dispRow);

  // Notes
  const notes = document.createElement('textarea');
  notes.className = 'roadmap-card__notes';
  notes.rows = 1;
  notes.placeholder = 'Notes d\'atelier…';
  notes.value = item.notes || '';
  notes.addEventListener('input', () => {
    item.notes = notes.value;
    autosize(notes);
    save(`Note ${item.id}`);
  });
  card.appendChild(notes);

  // Autosize on initial render
  setTimeout(() => { autosize(story); autosize(notes); }, 0);

  return card;
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 24) + 'px';
}

function renderNodeBadge(item, nodeId) {
  const node = state.treeIndex.get(nodeId);
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = node ? 'node-link-badge' : 'node-link-badge node-link-badge--unknown';
  badge.title = node ? `${node.label} (${nodeId}) — cliquer pour retirer` : `${nodeId} introuvable — cliquer pour retirer`;
  badge.innerHTML = `<span class="badge-id">${escapeHtml(nodeId)}</span> <span class="badge-label">${escapeHtml(node ? node.label : '?')}</span> <span class="badge-x">×</span>`;
  badge.addEventListener('click', () => {
    item.nodes = (item.nodes || []).filter(id => id !== nodeId);
    save(`Lien ${item.id} retiré ${nodeId}`);
    renderBoard();
  });
  return badge;
}

function renderAddNodeBtn(item) {
  return renderAddBtn({
    placeholder: 'rechercher un nœud (id ou libellé)…',
    source: () => [...state.treeIndex.values()],
    excluded: () => new Set(item.nodes || []),
    label: (n) => `<span class="badge-id">${escapeHtml(n.id)}</span> ${escapeHtml(n.label)}`,
    onPick: (n) => {
      if (!item.nodes) item.nodes = [];
      item.nodes.push(n.id);
      save(`Lien ${item.id} ajouté ${n.id}`);
      renderBoard();
    },
    btnText: '+ nœud',
  });
}

function renderDispBadge(item, dispId) {
  const d = state.dispositifsIndex.get(dispId);
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = d ? 'objective-link-badge' : 'objective-link-badge node-link-badge--unknown';
  badge.title = d ? `${d.name} (${dispId}) — cliquer pour retirer` : `${dispId} introuvable — cliquer pour retirer`;
  badge.innerHTML = `<span class="badge-id">${escapeHtml(dispId)}</span> <span class="badge-label">${escapeHtml(d ? d.name : '?')}</span> <span class="badge-x">×</span>`;
  badge.addEventListener('click', () => {
    item.dispositifs = (item.dispositifs || []).filter(id => id !== dispId);
    save(`Lien ${item.id} retiré ${dispId}`);
    renderBoard();
  });
  return badge;
}

function renderAddDispBtn(item) {
  return renderAddBtn({
    placeholder: 'rechercher un dispositif (id ou nom)…',
    source: () => [...state.dispositifsIndex.values()].map(d => ({ id: d.id, label: d.name })),
    excluded: () => new Set(item.dispositifs || []),
    label: (d) => `<span class="badge-id">${escapeHtml(d.id)}</span> ${escapeHtml(d.label)}`,
    onPick: (d) => {
      if (!item.dispositifs) item.dispositifs = [];
      item.dispositifs.push(d.id);
      save(`Lien ${item.id} ajouté ${d.id}`);
      renderBoard();
    },
    btnText: '+ dispositif',
  });
}

function renderAddBtn({ placeholder, source, excluded, label, onPick, btnText }) {
  const wrap = document.createElement('span');
  wrap.className = 'add-link';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-link__btn fr-btn fr-btn--tertiary fr-btn--sm';
  btn.textContent = btnText;
  wrap.appendChild(btn);

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input add-link__input';
    input.placeholder = placeholder;
    const dropdown = document.createElement('ul');
    dropdown.className = 'add-link__dropdown';
    wrap.append(input, dropdown);
    input.focus();

    function refresh() {
      const term = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      if (!term) return;
      const ex = excluded();
      const matches = source()
        .filter(n => !ex.has(n.id) && (n.label.toLowerCase().includes(term) || n.id.toLowerCase().includes(term)))
        .slice(0, 8);
      for (const n of matches) {
        const li = document.createElement('li');
        li.className = 'add-link__option';
        li.innerHTML = label(n);
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onPick(n);
        });
        dropdown.appendChild(li);
      }
    }
    input.addEventListener('input', refresh);
    input.addEventListener('blur', () => setTimeout(() => renderBoard(), 200));
  });
  return wrap;
}

function addItem(slice, action) {
  const item = {
    id: nextId(),
    slice,
    action,
    story: '',
    status: 'pending',
    notes: '',
    nodes: [],
    dispositifs: [],
  };
  state.data.items.push(item);
  save(`Ajout story ${item.id}`);
  renderBoard(); renderStats();
  // focus the new card
  setTimeout(() => {
    const card = boardEl.querySelector(`.roadmap-card[data-id="${item.id}"] .roadmap-card__story`);
    if (card) card.focus();
  }, 0);
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
    await reloadFromServer();
  });
  el.append('Identifié comme ', span, ' ', change);
}

async function reloadFromServer() {
  const { roadmap, revision } = await collab.fetchRoadmap();
  state.data = roadmap;
  collab.currentRoadmapRevisionId = revision.id;
  state.saveStatus = 'saved';
  renderStatus(); renderCalendar(); renderStats(); renderBoard();
}

// ---- Exports ----

function exportJson() {
  showExport('Export JSON', JSON.stringify(state.data, null, 2), 'roadmap.json', 'application/json');
}

function exportCsv() {
  const header = ['id', 'slice', 'action', 'story', 'status', 'nodes', 'dispositifs', 'notes'];
  const rows = [header];
  for (const it of state.data.items) {
    rows.push([
      it.id, it.slice, it.action, it.story, it.status,
      (it.nodes || []).join(' '), (it.dispositifs || []).join(' '),
      (it.notes || '').replace(/\n/g, ' '),
    ]);
  }
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n');
  showExport('Export CSV', csv, 'roadmap.csv', 'text/csv;charset=utf-8');
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
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
  actions.appendChild(makeBtn('Copier', 'fr-btn--secondary fr-icon-clipboard-line fr-btn--icon-left', async () => {
    try { await navigator.clipboard.writeText(content); } catch { ta.select(); document.execCommand('copy'); }
  }));
  actions.appendChild(makeBtn('Télécharger', 'fr-btn--secondary fr-icon-download-line fr-btn--icon-left', () => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }));
  actions.appendChild(makeBtn('Fermer', 'fr-btn--tertiary', () => dlg.dialog.close()));
  dlg.body.appendChild(actions);
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

function makeBtn(text, classes, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `fr-btn ${classes}`;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// ---- History dialog (roadmap revisions) ----

async function openHistoryDialog() {
  const dlg = openDialog('Historique des révisions — Roadmap');
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
    const res = await fetch('/api/roadmap/history?limit=200', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    revisions = data.revisions; headId = data.head_id;
  } catch (e) {
    left.textContent = 'Erreur : ' + e.message; return;
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
      <div class="history-item__date">${escapeHtml(formatDate(r.created_at))}</div>
    `;
    item.addEventListener('click', () => showRevisionDetail(r));
    left.appendChild(item);
  }

  async function showRevisionDetail(r) {
    right.innerHTML = '<p class="panel-empty">Chargement…</p>';
    try {
      const res = await fetch(`/api/roadmap/revisions/${r.id}`, { credentials: 'same-origin' });
      const cur = await res.json();
      let parentData = null;
      if (r.parent_id) {
        const p = await (await fetch(`/api/roadmap/revisions/${r.parent_id}`, { credentials: 'same-origin' })).json();
        parentData = p.roadmap;
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
        </p>
        <p class="fr-text--sm"><strong>Message :</strong> ${escapeHtml(r.message || '(aucun)')}</p>
      `;
      right.appendChild(meta);

      const diffWrap = document.createElement('div');
      const diffTitle = document.createElement('h4');
      diffTitle.className = 'fr-h6 fr-mt-3w';
      diffTitle.textContent = parentData ? 'Différences avec la révision parente' : 'Contenu initial';
      diffWrap.appendChild(diffTitle);

      const diffBody = document.createElement('div');
      if (parentData) {
        renderRoadmapDiff(diffBody, parentData, cur.roadmap);
      } else {
        diffBody.innerHTML = `<p class="panel-empty">${cur.roadmap.items.length} stories initiales.</p>`;
      }
      diffWrap.appendChild(diffBody);
      right.appendChild(diffWrap);
    } catch (e) {
      right.innerHTML = `<p class="panel-empty">Erreur : ${escapeHtml(e.message)}</p>`;
    }
  }

  if (revisions.length > 0) showRevisionDetail(revisions[0]);
}

function renderRoadmapDiff(container, oldData, newData) {
  const oldMap = new Map(oldData.items.map(i => [i.id, i]));
  const newMap = new Map(newData.items.map(i => [i.id, i]));
  const ids = new Set([...oldMap.keys(), ...newMap.keys()]);
  const changes = [];
  for (const id of ids) {
    const oldI = oldMap.get(id), newI = newMap.get(id);
    if (!oldI && newI) changes.push({ kind: 'added', id, item: newI });
    else if (oldI && !newI) changes.push({ kind: 'removed', id, item: oldI });
    else {
      const fields = [];
      for (const k of ['story', 'status', 'notes', 'slice', 'action']) {
        if (String(oldI[k] ?? '') !== String(newI[k] ?? '')) fields.push({ field: k, old: oldI[k], new: newI[k] });
      }
      const oldNodes = (oldI.nodes || []).join(','), newNodes = (newI.nodes || []).join(',');
      if (oldNodes !== newNodes) fields.push({ field: 'nodes', old: oldNodes, new: newNodes });
      const oldDisp = (oldI.dispositifs || []).join(','), newDisp = (newI.dispositifs || []).join(',');
      if (oldDisp !== newDisp) fields.push({ field: 'dispositifs', old: oldDisp, new: newDisp });
      if (fields.length) changes.push({ kind: 'changed', id, fields });
    }
  }
  if (!changes.length) {
    container.innerHTML = '<p class="panel-empty">Aucune différence.</p>'; return;
  }
  const ul = document.createElement('ul');
  ul.className = 'diff-list';
  for (const ch of changes.sort((a, b) => a.kind.localeCompare(b.kind))) {
    const li = document.createElement('li');
    li.className = `diff-item diff-${ch.kind}`;
    const head = document.createElement('div');
    head.className = 'diff-head';
    const badge = document.createElement('span');
    badge.className = `diff-badge diff-badge-${ch.kind}`;
    badge.textContent = ({ added: 'Ajouté', removed: 'Supprimé', changed: 'Modifié' })[ch.kind];
    const lbl = document.createElement('span');
    lbl.className = 'diff-label';
    lbl.textContent = ch.item ? (ch.item.story || '(sans titre)') : '';
    const idEl = document.createElement('span');
    idEl.className = 'diff-id';
    idEl.textContent = ch.id;
    head.append(badge, lbl, idEl);
    li.appendChild(head);
    if (ch.kind === 'changed') {
      const details = document.createElement('div');
      details.className = 'diff-details';
      for (const f of ch.fields) {
        const p = document.createElement('div');
        p.className = 'diff-field';
        p.innerHTML = `<span class="diff-field-name">${escapeHtml(f.field)}</span> : <del>${escapeHtml(String(f.old ?? ''))}</del> <ins>${escapeHtml(String(f.new ?? ''))}</ins>`;
        details.appendChild(p);
      }
      li.appendChild(details);
    }
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

// ---- Toolbar wiring ----

document.querySelectorAll('[data-action]').forEach(btn => {
  const action = btn.dataset.action;
  btn.addEventListener('click', () => {
    switch (action) {
      case 'view-history': openHistoryDialog(); break;
      case 'export-json':  exportJson(); break;
      case 'export-csv':   exportCsv(); break;
      case 'reset':
        if (!state.defaultData) { alert('Données par défaut non chargées.'); break; }
        if (confirm('Réinitialiser la roadmap aux données par défaut ?\n\nCela crée une nouvelle révision (l\'historique est conservé).')) {
          state.data = structuredClone(state.defaultData);
          save('Réinitialisation depuis roadmap.json');
          renderCalendar(); renderStats(); renderBoard();
        }
        break;
    }
  });
});

document.getElementById('search-input').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderBoard();
});
document.getElementById('status-filter').addEventListener('change', (e) => {
  state.statusFilter = e.target.value;
  renderBoard();
});

// ---- Boot ----

async function init() {
  // Load default data + tree + dispositifs in parallel.
  try {
    const [defResp, treeResp, dispResp] = await Promise.all([
      fetch(DEFAULT_DATA_URL, { cache: 'no-cache' }),
      fetch(TREE_URL, { cache: 'no-cache' }),
      fetch(DISPOSITIFS_URL, { cache: 'no-cache' }),
    ]);
    if (defResp.ok)  state.defaultData = await defResp.json();
    if (treeResp.ok) state.treeIndex = indexTree(await treeResp.json());
    if (dispResp.ok) {
      const data = await dispResp.json();
      for (const d of data.dispositifs ?? []) {
        state.dispositifsIndex.set(d.id, { id: d.id, name: d.name, audience: d.audience, category: d.category });
      }
    }
  } catch (e) {
    console.warn('Préchargement partiel:', e.message);
  }

  await ensureIdentified();
  renderIdentity();

  try {
    const { roadmap, revision } = await collab.fetchRoadmap();
    state.data = roadmap;
    collab.currentRoadmapRevisionId = revision.id;
    state.saveStatus = 'saved';
  } catch (e) {
    boardEl.innerHTML = `<p class="panel-empty">Impossible de charger la roadmap depuis le serveur : ${e.message}.</p>`;
    return;
  }

  // Fetch latest tree from server too, since it may differ from the static JSON.
  try {
    const { tree } = await collab.fetchTree();
    state.treeIndex = indexTree(tree);
  } catch { /* fall back to static index */ }

  renderCalendar();
  renderStats();
  renderBoard();
  renderStatus();
}

init();
