// Collaboration layer: identification, server-side persistence, history, comments.
// Exposes a singleton `collab` consumed by script.js.

import { projectScopedApi } from './project.js';

const API = '/api';
// Wrapper pour les endpoints scopés par projet.
const P = (path) => projectScopedApi(path);

async function http(method, url, body, extraHeaders = {}) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json', ...extraHeaders },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

class Collab {
  constructor() {
    this.user = null;
    this.currentRevisionId = null;
    this.currentRoadmapRevisionId = null;
    this._listeners = new Set();
  }

  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(event, payload) { for (const fn of this._listeners) fn(event, payload); }

  async me() {
    try {
      const { user } = await http('GET', `${API}/me`);
      this.user = user;
      return user;
    } catch (e) {
      if (e.status === 401) return null;
      throw e;
    }
  }

  async identify(name) {
    const { user } = await http('POST', `${API}/identify`, { name });
    this.user = user;
    this._emit('identified', user);
    return user;
  }

  async logout() {
    await http('POST', `${API}/logout`);
    this.user = null;
    this._emit('logged-out');
  }

  async fetchTree() {
    const data = await http('GET', P('/tree'));
    this.currentRevisionId = data.revision.id;
    return data;
  }

  async saveTree(tree, message = '') {
    const headers = this.currentRevisionId != null ? { 'If-Match': String(this.currentRevisionId) } : {};
    const data = await http('PUT', P('/tree'), { tree, message }, headers);
    this.currentRevisionId = data.revision.id;
    this._emit('saved', data.revision);
    return data;
  }

  async fetchHistory(limit = 100) {
    return http('GET', P(`/history?limit=${limit}`));
  }

  async fetchRevision(id) {
    return http('GET', P(`/revisions/${id}`));
  }

  async revert(id, message) {
    const data = await http('POST', P(`/revisions/${id}/revert`), { message });
    this.currentRevisionId = data.revision.id;
    this._emit('saved', data.revision);
    return data;
  }

  async fetchCommentCounts() {
    return http('GET', P('/comments'));
  }

  async fetchComments(nodeId) {
    return http('GET', P(`/comments?node_id=${encodeURIComponent(nodeId)}`));
  }

  async postComment(nodeId, body) {
    return http('POST', P('/comments'), { node_id: nodeId, body });
  }

  async deleteComment(id) {
    return http('DELETE', P(`/comments/${id}`));
  }

  async fetchRoadmap() {
    const data = await http('GET', P('/roadmap'));
    this.currentRoadmapRevisionId = data.revision.id;
    return data;
  }

  async saveRoadmap(roadmap, message = '') {
    const headers = this.currentRoadmapRevisionId != null
      ? { 'If-Match': String(this.currentRoadmapRevisionId) }
      : {};
    const data = await http('PUT', P('/roadmap'), { roadmap, message }, headers);
    this.currentRoadmapRevisionId = data.revision.id;
    this._emit('roadmap-saved', data.revision);
    return data;
  }

  // Catalogues per-projet (dispositifs / mesures / objectifs / drupal_structure)
  async fetchData(key) {
    return http('GET', P(`/data/${encodeURIComponent(key)}`));
  }

  async saveData(key, data) {
    return http('PUT', P(`/data/${encodeURIComponent(key)}`), { data });
  }
}

export const collab = new Collab();

// ---- UI helpers ----

const NAME_KEY = 'portail-electrification.lastname';

export function showIdentifyModal({ initialName = '', message = '' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog identify-dialog';
    dialog.innerHTML = `
      <h2 class="fr-h6">Bienvenue</h2>
      <p class="fr-text--sm">Indiquez votre nom pour partager vos modifications et commentaires avec les autres contributeurs. Pas d'authentification : c'est juste une étiquette pour tracer qui fait quoi.</p>
      ${message ? `<p class="fr-error-text">${escapeHtml(message)}</p>` : ''}
      <form method="dialog">
        <div class="fr-input-group">
          <label class="fr-label" for="identify-name">Votre nom ou pseudo</label>
          <input class="fr-input" id="identify-name" name="name" required maxlength="60" autocomplete="name">
        </div>
        <div class="panel-actions">
          <button type="submit" class="fr-btn fr-icon-check-line fr-btn--icon-left" value="ok">Continuer</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    const input = dialog.querySelector('#identify-name');
    input.value = initialName || localStorage.getItem(NAME_KEY) || '';
    dialog.addEventListener('close', () => {
      const name = input.value.trim();
      dialog.remove();
      if (name) localStorage.setItem(NAME_KEY, name);
      resolve(name);
    });
    dialog.showModal();
    setTimeout(() => input.focus(), 30);
  });
}

export async function ensureIdentified() {
  let user = await collab.me();
  while (!user) {
    const name = await showIdentifyModal();
    if (!name) continue;
    try {
      user = await collab.identify(name);
    } catch (e) {
      await showIdentifyModal({ initialName: name, message: 'Erreur : ' + (e.message || 'identification impossible') });
    }
  }
  return user;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// ---- Tree diff ----

// Scalar attrs compared as-is (after canonicalisation).
const NODE_ATTRS = ['label', 'tldr', 'format', 'url', 'priority', 'complexity', 'auth', 'deadline', 'objectif'];
// Set-valued fields. Legacy singular fallbacks live in `canonicalSet`.
const SET_FIELDS = ['types', 'audiences', 'mesures', 'dispositifs'];
// item-array fields keyed by `id`; values are the per-item scalar attrs we compare.
const LIST_FIELDS = {
  blocks:       ['title', 'description'],
  improvements: ['title', 'description', 'deadline'],
};

// Resolve a set-valued field with the same fallbacks as normalizeNode in script.js,
// so revisions saved before normalisation (legacy `type`/`audience`/`mesure_plan`)
// don't all light up as "types added" once the field is canonicalised.
function canonicalSet(node, field) {
  if (Array.isArray(node[field])) return [...node[field]];
  if (field === 'types' && node.type) return [node.type];
  if (field === 'audiences' && node.audience) return [node.audience];
  if (field === 'mesures' && node.mesure_plan) return [node.mesure_plan];
  return [];
}

function flattenTree(root) {
  const map = new Map();
  function rec(node, parentId, index) {
    const childIds = (node.children ?? []).map(c => c.id);
    const sets = Object.fromEntries(SET_FIELDS.map(k => [k, canonicalSet(node, k)]));
    const lists = Object.fromEntries(
      Object.keys(LIST_FIELDS).map(k => [k, Array.isArray(node[k]) ? node[k].map(it => ({ ...it })) : []])
    );
    map.set(node.id, {
      id: node.id,
      parent_id: parentId,
      index,
      attrs: Object.fromEntries(NODE_ATTRS.map(k => [k, node[k] ?? ''])),
      sets,
      lists,
      children: childIds,
    });
    (node.children ?? []).forEach((c, i) => rec(c, node.id, i));
  }
  rec(root, null, 0);
  return map;
}

function diffSet(oldArr, newArr) {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  const added = [...newSet].filter(x => !oldSet.has(x));
  const removed = [...oldSet].filter(x => !newSet.has(x));
  return { added, removed };
}

function diffList(oldArr, newArr, itemAttrs) {
  const oldById = new Map(oldArr.map(it => [it.id, it]));
  const newById = new Map(newArr.map(it => [it.id, it]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, item] of newById) {
    if (!oldById.has(id)) added.push(item);
  }
  for (const [id, item] of oldById) {
    if (!newById.has(id)) removed.push(item);
  }
  for (const [id, newItem] of newById) {
    const oldItem = oldById.get(id);
    if (!oldItem) continue;
    const itemFields = [];
    for (const k of itemAttrs) {
      if (String(oldItem[k] ?? '') !== String(newItem[k] ?? '')) {
        itemFields.push({ field: k, old: oldItem[k] ?? '', new: newItem[k] ?? '' });
      }
    }
    if (itemFields.length) changed.push({ id, fields: itemFields, oldItem, newItem });
  }
  return { added, removed, changed };
}

export function diffTrees(oldRoot, newRoot) {
  const a = flattenTree(oldRoot);
  const b = flattenTree(newRoot);
  const ids = new Set([...a.keys(), ...b.keys()]);
  const changes = [];
  for (const id of ids) {
    const oldN = a.get(id);
    const newN = b.get(id);
    if (!oldN && newN) {
      changes.push({ kind: 'added', id, node: newN });
    } else if (oldN && !newN) {
      changes.push({ kind: 'removed', id, node: oldN });
    } else {
      const moved = oldN.parent_id !== newN.parent_id;
      const reordered = !moved && oldN.index !== newN.index;
      const fieldChanges = [];
      for (const k of NODE_ATTRS) {
        if (String(oldN.attrs[k] ?? '') !== String(newN.attrs[k] ?? '')) {
          fieldChanges.push({ field: k, old: oldN.attrs[k], new: newN.attrs[k] });
        }
      }
      for (const k of SET_FIELDS) {
        const { added, removed } = diffSet(oldN.sets[k], newN.sets[k]);
        if (added.length || removed.length) {
          fieldChanges.push({ field: k, kind: 'set', added, removed });
        }
      }
      for (const [k, itemAttrs] of Object.entries(LIST_FIELDS)) {
        const d = diffList(oldN.lists[k], newN.lists[k], itemAttrs);
        if (d.added.length || d.removed.length || d.changed.length) {
          fieldChanges.push({ field: k, kind: 'list', ...d });
        }
      }
      if (moved || reordered || fieldChanges.length) {
        changes.push({ kind: 'changed', id, moved, reordered, fields: fieldChanges, oldNode: oldN, newNode: newN });
      }
    }
  }
  return changes;
}

export function renderDiff(container, oldTree, newTree, labels = { old: 'Avant', new: 'Après' }) {
  const changes = diffTrees(oldTree, newTree);
  container.innerHTML = '';
  if (changes.length === 0) {
    container.innerHTML = '<p class="panel-empty">Aucune différence.</p>';
    return;
  }
  // Build a quick lookup of labels by id (prefer new tree, fallback to old)
  const labelOf = (id) => {
    const findIn = (root) => {
      const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.id === id) return n.label;
        for (const c of n.children ?? []) stack.push(c);
      }
      return null;
    };
    return findIn(newTree) ?? findIn(oldTree) ?? id;
  };

  const ul = document.createElement('ul');
  ul.className = 'diff-list';
  for (const ch of changes.sort((x, y) => x.kind.localeCompare(y.kind))) {
    const li = document.createElement('li');
    li.className = `diff-item diff-${ch.kind}`;
    const head = document.createElement('div');
    head.className = 'diff-head';
    const badge = document.createElement('span');
    badge.className = `diff-badge diff-badge-${ch.kind}`;
    badge.textContent = ({ added: 'Ajouté', removed: 'Supprimé', changed: 'Modifié' })[ch.kind];
    const lbl = document.createElement('span');
    lbl.className = 'diff-label';
    lbl.textContent = labelOf(ch.id);
    const idEl = document.createElement('span');
    idEl.className = 'diff-id';
    idEl.textContent = ch.id;
    head.append(badge, lbl, idEl);
    li.appendChild(head);

    if (ch.kind === 'changed') {
      const details = document.createElement('div');
      details.className = 'diff-details';
      if (ch.moved) {
        const p = document.createElement('div');
        p.className = 'diff-field';
        p.innerHTML = `<span class="diff-field-name">déplacé</span> : parent <code>${escapeHtml(ch.oldNode.parent_id ?? 'null')}</code> → <code>${escapeHtml(ch.newNode.parent_id ?? 'null')}</code>`;
        details.appendChild(p);
      }
      if (ch.reordered) {
        const p = document.createElement('div');
        p.className = 'diff-field';
        p.innerHTML = `<span class="diff-field-name">position</span> : ${ch.oldNode.index} → ${ch.newNode.index}`;
        details.appendChild(p);
      }
      for (const f of ch.fields) {
        const p = document.createElement('div');
        p.className = 'diff-field';
        if (f.kind === 'set') {
          const addedHtml = f.added.map(v => `<ins>${escapeHtml(String(v))}</ins>`).join(' ');
          const removedHtml = f.removed.map(v => `<del>${escapeHtml(String(v))}</del>`).join(' ');
          p.innerHTML = `<span class="diff-field-name">${escapeHtml(f.field)}</span> : ${removedHtml} ${addedHtml}`.trim();
        } else if (f.kind === 'list') {
          const parts = [];
          if (f.added.length)   parts.push(`<ins>+${f.added.length}</ins>`);
          if (f.removed.length) parts.push(`<del>−${f.removed.length}</del>`);
          if (f.changed.length) parts.push(`<span class="diff-list-modified">~${f.changed.length}</span>`);
          p.innerHTML = `<span class="diff-field-name">${escapeHtml(f.field)}</span> : ${parts.join(' ')}`;
          if (f.added.length || f.removed.length || f.changed.length) {
            const sub = document.createElement('ul');
            sub.className = 'diff-sublist';
            for (const it of f.added) {
              const li = document.createElement('li');
              const title = it.title || it.id;
              li.innerHTML = `<span class="diff-badge diff-badge-added">Ajouté</span> ${escapeHtml(title)}`;
              sub.appendChild(li);
            }
            for (const it of f.removed) {
              const li = document.createElement('li');
              const title = it.title || it.id;
              li.innerHTML = `<span class="diff-badge diff-badge-removed">Supprimé</span> <del>${escapeHtml(title)}</del>`;
              sub.appendChild(li);
            }
            for (const it of f.changed) {
              const li = document.createElement('li');
              const title = it.newItem.title || it.oldItem.title || it.id;
              const fieldsHtml = it.fields.map(sf =>
                `<span class="diff-field-name">${escapeHtml(sf.field)}</span> : <del>${escapeHtml(String(sf.old ?? ''))}</del> <ins>${escapeHtml(String(sf.new ?? ''))}</ins>`
              ).join(' · ');
              li.innerHTML = `<span class="diff-badge diff-badge-changed">Modifié</span> ${escapeHtml(title)} — ${fieldsHtml}`;
              sub.appendChild(li);
            }
            p.appendChild(sub);
          }
        } else {
          const oldHtml = `<del>${escapeHtml(String(f.old ?? ''))}</del>`;
          const newHtml = `<ins>${escapeHtml(String(f.new ?? ''))}</ins>`;
          p.innerHTML = `<span class="diff-field-name">${escapeHtml(f.field)}</span> : ${oldHtml} ${newHtml}`;
        }
        details.appendChild(p);
      }
      li.appendChild(details);
    }
    ul.appendChild(li);
  }
  container.appendChild(ul);
}
