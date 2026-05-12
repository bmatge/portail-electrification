import { setup } from './cartography.js';
import { collab, ensureIdentified, escapeHtml } from './collab.js';

// Server-side tree, loaded once and kept in sync with PUT /api/tree.
let treeData = null;
let treeIndex = new Map(); // nodeId → { id, label, type, parentId? }

function indexTree(root) {
  const map = new Map();
  function rec(node, parent) {
    map.set(node.id, { id: node.id, label: node.label, type: node.type, parentId: parent?.id ?? null });
    for (const c of node.children ?? []) rec(c, node);
  }
  rec(root, null);
  return map;
}

function findNode(id, root = treeData) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const r = findNode(id, c);
    if (r) return r;
  }
  return null;
}

function nodesLinkedTo(dispositifId) {
  const out = [];
  if (!treeData) return out;
  (function rec(n) {
    if ((n.dispositifs || []).includes(dispositifId)) out.push(n);
    for (const c of n.children ?? []) rec(c);
  })(treeData);
  return out;
}

// Debounced tree save.
let saveTimer = null;
let pendingMessage = '';
function scheduleTreeSave(message) {
  pendingMessage = message;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await collab.saveTree(treeData, pendingMessage);
    } catch (e) {
      if (e.status === 401) {
        await ensureIdentified();
        try { await collab.saveTree(treeData, pendingMessage); } catch (e2) { alert('Erreur enregistrement : ' + e2.message); }
      } else if (e.status === 409) {
        alert('Conflit : l\'arborescence a été modifiée par quelqu\'un d\'autre. Rechargez la page.');
      } else {
        alert('Erreur enregistrement : ' + e.message);
      }
    }
  }, 600);
}

async function linkNodeToDispositif(nodeId, dispositifId) {
  const node = findNode(nodeId);
  if (!node) return;
  if (!node.dispositifs) node.dispositifs = [];
  if (!node.dispositifs.includes(dispositifId)) {
    node.dispositifs.push(dispositifId);
    scheduleTreeSave(`Rattachement ${dispositifId} → ${nodeId} (depuis dispositifs)`);
  }
}

async function unlinkNodeFromDispositif(nodeId, dispositifId) {
  const node = findNode(nodeId);
  if (!node) return;
  node.dispositifs = (node.dispositifs || []).filter(d => d !== dispositifId);
  scheduleTreeSave(`Détachement ${dispositifId} ← ${nodeId} (depuis dispositifs)`);
}

function renderNodesSection(item, ctx) {
  const wrap = document.createElement('section');
  wrap.className = 'dispositifs-section';

  const h = document.createElement('h3');
  h.className = 'fr-h6 fr-mt-4w';
  h.textContent = "Nœuds de l'arborescence rattachés";
  wrap.appendChild(h);

  if (!treeData) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.textContent = 'Chargement de l\'arborescence…';
    wrap.appendChild(p);
    return wrap;
  }

  const linked = nodesLinkedTo(item.id);
  const list = document.createElement('div');
  list.className = 'dispositif-link-list';

  if (linked.length === 0) {
    const p = document.createElement('p');
    p.className = 'panel-empty fr-text--xs';
    p.style.margin = '0';
    p.textContent = 'Aucun nœud rattaché à ce dispositif.';
    list.appendChild(p);
  } else {
    for (const node of linked) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'node-link-badge';
      badge.title = `${node.label} (${node.id}) — cliquer pour retirer`;
      badge.innerHTML = `<span class="badge-id">${escapeHtml(node.id)}</span> <span class="badge-label">${escapeHtml(node.label)}</span> <span class="badge-x">×</span>`;
      badge.addEventListener('click', async () => {
        await unlinkNodeFromDispositif(node.id, item.id);
        ctx.render();
      });
      list.appendChild(badge);
    }
  }
  wrap.appendChild(list);

  // Add button
  const addWrap = document.createElement('div');
  addWrap.className = 'add-link';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-link__btn fr-btn fr-btn--tertiary fr-btn--sm';
  addBtn.textContent = '+ lier un nœud';
  addWrap.appendChild(addBtn);

  addBtn.addEventListener('click', () => {
    addBtn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input add-link__input';
    input.placeholder = 'rechercher un nœud (id ou libellé)…';
    const dropdown = document.createElement('ul');
    dropdown.className = 'add-link__dropdown';
    addWrap.append(input, dropdown);
    input.focus();

    function refresh() {
      const term = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      if (!term) return;
      const already = new Set(nodesLinkedTo(item.id).map(n => n.id));
      const matches = [...treeIndex.values()]
        .filter(n => !already.has(n.id) && (n.label.toLowerCase().includes(term) || n.id.toLowerCase().includes(term)))
        .slice(0, 8);
      for (const n of matches) {
        const li = document.createElement('li');
        li.className = 'add-link__option';
        li.innerHTML = `<span class="badge-id">${escapeHtml(n.id)}</span> ${escapeHtml(n.label)}`;
        li.addEventListener('mousedown', async (e) => {
          e.preventDefault();
          await linkNodeToDispositif(n.id, item.id);
          ctx.render();
        });
        dropdown.appendChild(li);
      }
    }
    input.addEventListener('input', refresh);
    input.addEventListener('blur', () => setTimeout(() => ctx.renderPanel(), 200));
  });
  wrap.appendChild(addWrap);

  return wrap;
}

// Boot: load tree (no forced identification), set up the cartography editor.
// Identity rendering is handled by layout.js.
// Identification is requested lazily on first save attempt.
(async function boot() {
  try {
    const { tree } = await collab.fetchTree();
    treeData = tree;
    treeIndex = indexTree(tree);
  } catch (e) {
    console.warn('Tree non disponible:', e.message);
  }

  setup({
    storageKey: 'portail-electrification.dispositifs.v1',
    dataUrl: 'assets/data/dispositifs.json',
    itemsKey: 'dispositifs',
    idPrefix: 'D-N',
    exportFilename: 'dispositifs.json',

    filters: [
      {
        selectId: 'filter-category',
        matches: (item, value) => item.category === value,
        populate: (items) => [...new Set(items.map(i => i.category).filter(Boolean))].sort(),
      },
      {
        selectId: 'filter-audience',
        matches: (item, value) => item.audience === value,
        populate: (items) => [...new Set(items.map(i => i.audience).filter(Boolean))].sort(),
      },
    ],

    newItem: (id) => ({
      id, category: '', audience: '', name: 'Nouveau dispositif',
      url: '', tel: '', description: '',
      porteur: '', tutelle: '', type: '',
      reutilisable: '', maturite: '',
      commentaire: '',
    }),

    renderListCard: (card, item) => {
      const head = document.createElement('div');
      head.className = 'item-card__head';
      const id = document.createElement('span');
      id.className = 'item-card__id';
      id.textContent = item.id;
      const name = document.createElement('strong');
      name.className = 'item-card__name';
      name.textContent = item.name || '(sans nom)';
      head.append(id, name);
      card.appendChild(head);

      const meta = document.createElement('div');
      meta.className = 'item-card__meta';
      if (item.category) meta.appendChild(badge(item.category, 'badge-cat'));
      if (item.audience) meta.appendChild(badge(item.audience, 'badge-aud'));
      if (item.type)     meta.appendChild(badge(item.type, 'badge-type'));
      // Show count of linked tree nodes if any
      if (treeData) {
        const n = nodesLinkedTo(item.id).length;
        if (n > 0) {
          const link = document.createElement('span');
          link.className = 'item-badge';
          link.style.background = '#e3e3fd';
          link.style.color = '#3a3a8c';
          link.style.borderColor = '#6a6af4';
          link.textContent = `🔗 ${n} nœud${n > 1 ? 's' : ''}`;
          meta.appendChild(link);
        }
      }
      card.appendChild(meta);

      if (item.porteur) {
        const p = document.createElement('p');
        p.className = 'item-card__porteur';
        p.textContent = `Porteur : ${item.porteur}`;
        card.appendChild(p);
      }
    },

    detailFields: [
      { key: 'name',         label: 'Nom',                                 kind: 'input' },
      { key: 'category',     label: 'Catégorie',                            kind: 'input' },
      { key: 'audience',     label: 'Audience',                             kind: 'input' },
      { key: 'description',  label: 'Description',                          kind: 'textarea' },
      { key: 'url',          label: 'URL',                                  kind: 'input', type: 'url' },
      { key: 'tel',          label: 'Téléphone',                            kind: 'input' },
      { key: 'porteur',      label: 'Porteur',                              kind: 'input' },
      { key: 'tutelle',      label: 'Tutelle',                              kind: 'input' },
      { key: 'type',         label: 'Type',                                 kind: 'input' },
      { key: 'reutilisable', label: 'Réutilisabilité dans le hub',           kind: 'textarea', rows: 2 },
      { key: 'maturite',     label: 'Maturité',                              kind: 'input' },
      { key: 'commentaire',  label: 'Commentaire / notes',                   kind: 'textarea', rows: 4 },
    ],

    renderExtraDetail: (item, ctx) => renderNodesSection(item, ctx),
  });
})();

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = `item-badge ${cls}`;
  b.textContent = text;
  return b;
}
