// Maquette interactive : navigation entre les nœuds de l'arborescence avec
// prévisualisation de la page (colonne principale) et édition des propriétés
// Drupal SFD (colonne latérale). Persiste dans le même JSON via collab.saveTree.

import { collab, ensureIdentified, escapeHtml } from './collab.js';

// ---- Vocabulaires ----

const DRUPAL_TYPES = [
  'Accueil',
  'Rubrique',
  'Article',
  'Page neutre',
  'Webform',
  'Hors SFD',
];

const PARAGRAPHS = {
  accordion:        { label: 'Accordéon',                     hint: 'Q/R repliables (vrai/faux, FAQ)' },
  tabs:             { label: 'Onglets',                        hint: 'Sections d\'une page (Objectif, Pour qui, Quand…)' },
  'cards-row':      { label: 'Rangée de cartes',               hint: 'Orientation vers les pages enfants' },
  'tiles-row':      { label: 'Rangée de tuiles',               hint: 'Navigation secondaire' },
  'auto-list':      { label: 'Remontée auto',                  hint: 'Liste dynamique par taxonomie' },
  summary:          { label: 'Sommaire',                       hint: 'Table des matières (pages longues)' },
  button:           { label: 'Bouton(s)',                       hint: 'CTA / renvoi sortant' },
  highlight:        { label: 'Mise en exergue',                 hint: 'Encadré informatif' },
  callout:          { label: 'Bloc de mise en avant',           hint: 'Encadré coloré, accent fort' },
  'image-text':     { label: 'Image et texte',                  hint: 'Visuel + texte côte à côte' },
  quote:            { label: 'Citation',                        hint: 'Verbatim, témoignage' },
  table:            { label: 'Tableau',                         hint: 'Données tabulaires' },
  video:            { label: 'Vidéo',                           hint: 'YouTube, Vimeo, Dailymotion' },
  'download-block': { label: 'Bloc de téléchargement',          hint: 'Fichier unique mis en avant' },
  'download-links': { label: 'Liens de téléchargement',         hint: 'Liste de fichiers' },
  'cards-download': { label: 'Cartes de téléchargement',        hint: 'Téléchargements en grille' },
  code:             { label: 'Code (hors SFD)',                  hint: 'Iframe / carte interactive — dev complémentaire' },
};

// Stockage : on garde les clés `univers` et `cibles` pour ne rien casser ;
// les libellés et options visibles ont été refondus.
// Schémas d'édition par type de paragraphe : décrivent la forme de p.data
// (items[]/simple/text) et fournissent les valeurs par défaut affichées en
// placeholder lorsque l'utilisateur n'a rien saisi.
const PARAGRAPH_SCHEMAS = {
  accordion: {
    kind: 'items',
    fields: [
      { key: 'q', label: 'Question' },
      { key: 'a', label: 'Réponse', textarea: true },
    ],
    itemLabel: 'Question / Réponse',
    addLabel: 'Ajouter une question',
    defaults: [
      { q: 'Question fréquente n°1', a: 'Réponse à rédiger.' },
      { q: 'Question fréquente n°2', a: 'Réponse à rédiger.' },
      { q: 'Question fréquente n°3', a: 'Réponse à rédiger.' },
    ],
  },
  tabs: {
    kind: 'items',
    fields: [
      { key: 'label', label: 'Libellé onglet' },
      { key: 'content', label: 'Contenu', textarea: true },
    ],
    itemLabel: 'Onglet',
    addLabel: 'Ajouter un onglet',
    defaults: [
      { label: 'Objectif', content: 'Contenu de l\'onglet actif…' },
      { label: 'Pour qui', content: '' },
      { label: 'Quand',    content: '' },
      { label: 'Comment',  content: '' },
      { label: 'Quel gain', content: '' },
    ],
  },
  'cards-row': {
    kind: 'items',
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'desc',  label: 'Description', textarea: true },
    ],
    itemLabel: 'Carte',
    addLabel: 'Ajouter une carte',
    defaults: [
      { title: 'Carte 1', desc: 'Description courte' },
      { title: 'Carte 2', desc: 'Description courte' },
      { title: 'Carte 3', desc: 'Description courte' },
    ],
  },
  'tiles-row': {
    kind: 'items',
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'desc',  label: 'Description', textarea: true },
    ],
    itemLabel: 'Tuile',
    addLabel: 'Ajouter une tuile',
    defaults: [
      { title: 'Tuile 1', desc: 'Description courte' },
      { title: 'Tuile 2', desc: 'Description courte' },
      { title: 'Tuile 3', desc: 'Description courte' },
    ],
  },
  summary: {
    kind: 'items',
    fields: [{ key: 'text', label: 'Entrée du sommaire' }],
    itemLabel: 'Entrée',
    addLabel: 'Ajouter une entrée',
    defaults: [
      { text: '1. Première section' },
      { text: '2. Deuxième section' },
      { text: '3. Troisième section' },
    ],
  },
  'download-block': {
    kind: 'items',
    fields: [{ key: 'label', label: 'Libellé' }, { key: 'size', label: 'Taille' }],
    itemLabel: 'Fichier',
    addLabel: 'Ajouter un fichier',
    defaults: [
      { label: 'document_1.pdf', size: '1,2 Mo' },
      { label: 'document_2.pdf', size: '0,8 Mo' },
    ],
  },
  'download-links': {
    kind: 'items',
    fields: [{ key: 'label', label: 'Libellé' }, { key: 'size', label: 'Taille' }],
    itemLabel: 'Lien',
    addLabel: 'Ajouter un lien',
    defaults: [
      { label: 'document_1.pdf', size: '1,2 Mo' },
      { label: 'document_2.pdf', size: '0,8 Mo' },
    ],
  },
  'cards-download': {
    kind: 'items',
    fields: [{ key: 'label', label: 'Libellé' }, { key: 'size', label: 'Taille' }],
    itemLabel: 'Téléchargement',
    addLabel: 'Ajouter un téléchargement',
    defaults: [
      { label: 'document_1.pdf', size: '1,2 Mo' },
      { label: 'document_2.pdf', size: '0,8 Mo' },
    ],
  },
  button: {
    kind: 'simple',
    fields: [
      { key: 'label', label: 'Libellé du bouton' },
      { key: 'url',   label: 'URL de destination', type: 'url' },
    ],
    defaults: { label: 'Accéder au service', url: '' },
  },
  callout: {
    kind: 'simple',
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'text',  label: 'Texte', textarea: true },
    ],
    defaults: { title: 'À retenir', text: 'Bloc de mise en avant éditorial.' },
  },
  'image-text': {
    kind: 'simple',
    fields: [
      { key: 'alt',  label: 'Description / légende image' },
      { key: 'text', label: 'Texte associé', textarea: true },
    ],
    defaults: { alt: 'image', text: 'Texte associé à l\'image.' },
  },
  video: {
    kind: 'simple',
    fields: [{ key: 'url', label: 'URL (YouTube / Vimeo / Dailymotion)' }],
    defaults: { url: '' },
  },
  highlight:   { kind: 'text', textarea: true, defaults: 'Mise en exergue : citation, message-clé, accroche.' },
  quote:       { kind: 'text', textarea: true, defaults: 'Verbatim ou témoignage à intégrer.' },
  'auto-list': { kind: 'text', textarea: false, defaults: '' },
  code:        { kind: 'text', textarea: true, defaults: 'Bloc Code (hors SFD) — iframe officielle ou carte interactive.' },
  table:       { kind: 'text', textarea: true, defaults: '' },
};

function defaultsFor(code) {
  const s = PARAGRAPH_SCHEMAS[code];
  if (!s || s.defaults === undefined) return undefined;
  return JSON.parse(JSON.stringify(s.defaults));
}

function hasData(p) {
  const s = PARAGRAPH_SCHEMAS[p.code];
  if (!s || p.data == null) return false;
  if (s.kind === 'text') return typeof p.data === 'string' && p.data.trim() !== '';
  if (s.kind === 'items') return Array.isArray(p.data) && p.data.some(it => Object.values(it).some(v => v && String(v).trim()));
  if (s.kind === 'simple') return p.data && Object.values(p.data).some(v => v && String(v).trim());
  return false;
}

function dataOrDefaults(p) {
  return hasData(p) ? p.data : defaultsFor(p.code);
}

const TAXO = {
  univers: {
    label: 'Type éditorial',
    multi: false,
    options: ['Actualité', 'Page rubrique', 'Fiche pratique', 'Fiche mesure', 'Simulateur et outils'],
  },
  cibles: {
    label: 'Public',
    multi: true,
    options: ['Tous publics', 'Particuliers', 'Artisans', 'Industriels', 'Agriculteurs', 'Collectivités'],
  },
  mesures: {
    label: 'Mesure',
    multi: true,
    options: Array.from({ length: 22 }, (_, i) => `M${i + 1}`),
  },
};

const AUDIENCE_TO_PUBLIC = {
  particuliers:  'Particuliers',
  agriculteurs:  'Agriculteurs',
  industriels:   'Industriels',
  collectivites: 'Collectivités',
};

// ---- État ----

const state = {
  tree: null,
  currentId: null,
  currentNode: null,
  currentParents: [],
  // id du nœud de premier niveau dont le panneau mega-menu est ouvert (ou null)
  openMenuId: null,
  // index du paragraphe en cours d'édition dans la page courante (ou null)
  editingParagraphIdx: null,
  // brouillon de l'édition en cours : { title, data } ; clone défensif des
  // valeurs courantes pour pouvoir annuler sans muter la source.
  editDraft: null,
};

let saveTimer = null;
let pendingMessage = '';

function scheduleSave(message) {
  pendingMessage = message;
  setStatus('saving');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 600);
}

async function flushSave() {
  const msg = pendingMessage;
  pendingMessage = '';
  try {
    await collab.saveTree(state.tree, msg);
    setStatus('saved');
  } catch (e) {
    if (e.status === 401) {
      await ensureIdentified();
      try {
        await collab.saveTree(state.tree, msg);
        setStatus('saved');
      } catch (e2) {
        setStatus('error', e2.message);
      }
    } else if (e.status === 409) {
      setStatus('error', 'Conflit : rechargez la page.');
    } else {
      setStatus('error', e.message);
    }
  }
}

function setStatus(kind, msg = '') {
  const el = document.getElementById('maquette-status');
  if (!el) return;
  el.className = 'maquette-status maquette-status--' + kind;
  el.textContent = ({
    saving: 'Enregistrement…',
    saved:  'Enregistré',
    error:  'Erreur : ' + msg,
    idle:   '',
  })[kind] || '';
}

// ---- Walking helpers ----

function findNode(id, root = state.tree) {
  if (!root) return null;
  if (root.id === id) return { node: root, parents: [] };
  for (const c of root.children ?? []) {
    if (c.id === id) return { node: c, parents: [root] };
    const r = findNode(id, c);
    if (r) return { node: r.node, parents: [root, ...r.parents] };
  }
  return null;
}

// ---- Seed des propriétés Drupal ----

function seedMaquette(node, parents) {
  const t = (node.types && node.types[0]) || node.type || 'editorial';
  const hasChildren = (node.children ?? []).length > 0;
  const labelLow = (node.label || '').toLowerCase();

  // 1) drupal_type
  let drupal_type = 'Article';
  if (t === 'hub') drupal_type = 'Accueil';
  else if (t === 'kit') drupal_type = 'Rubrique';
  else if (t === 'form') drupal_type = 'Webform';
  else if (t === 'marketplace') drupal_type = 'Hors SFD';
  else if (t === 'editorial' && hasChildren) drupal_type = 'Rubrique';

  // 2) paragraphes (codes, transformés en objets en sortie)
  let paragraphCodes = [];
  if (drupal_type === 'Accueil') paragraphCodes = ['cards-row', 'highlight', 'auto-list'];
  else if (drupal_type === 'Rubrique' && t === 'kit') paragraphCodes = ['cards-download', 'download-links'];
  else if (drupal_type === 'Rubrique') paragraphCodes = ['cards-row', 'auto-list'];
  else if (t === 'simulator' || t === 'map' || t === 'service') paragraphCodes = ['code'];
  else if (t === 'external') paragraphCodes = ['button', 'highlight'];
  else if (t === 'editorial') {
    if (labelLow.includes('vrai/faux') || labelLow.includes('vrai-faux')) paragraphCodes = ['accordion'];
    else if (node.mesure_plan || (node.mesures && node.mesures.length)) paragraphCodes = ['tabs'];
    else paragraphCodes = ['image-text', 'button'];
  }
  const paragraphs = paragraphCodes.map(code => ({ code, title: '', data: undefined }));

  // 3) Type éditorial (heuristique sur le type de nœud existant)
  let univers = '';
  if (t === 'editorial' && hasChildren) univers = 'Page rubrique';
  else if (drupal_type === 'Accueil') univers = 'Page rubrique';
  else if (t === 'simulator' || t === 'map' || t === 'service') univers = 'Simulateur et outils';
  else if (node.mesure_plan || (node.mesures && node.mesures.length)) univers = 'Fiche mesure';
  else if (t === 'editorial') univers = 'Fiche pratique';

  // 4) Public ← node.audiences
  const cibles = (node.audiences || [])
    .map(a => AUDIENCE_TO_PUBLIC[a])
    .filter(Boolean);

  // 5) Mesures ← node.mesures
  const mesures = Array.isArray(node.mesures) ? [...node.mesures] : [];

  return {
    drupal_type,
    paragraphs,
    taxonomy: { univers, cibles, mesures },
    seeded: true,
  };
}

function normalizeParagraph(p) {
  if (typeof p === 'string') return { code: p, title: '', data: undefined };
  if (!p || typeof p !== 'object') return null;
  const out = { code: p.code, title: p.title || '', data: undefined };
  // Migration : l'ancien champ free-text `content` est promu en p.data
  // pour les schémas text-kind ; ignoré pour items/simple.
  if (p.data !== undefined) {
    out.data = p.data;
  } else if (typeof p.content === 'string' && p.content.trim()) {
    const s = PARAGRAPH_SCHEMAS[p.code];
    if (s && s.kind === 'text') out.data = p.content;
  }
  return out;
}

function ensureMaquette(node, parents = []) {
  if (!node.maquette || typeof node.maquette !== 'object') {
    node.maquette = seedMaquette(node, parents);
  } else {
    const defaults = seedMaquette(node, parents);
    if (!node.maquette.drupal_type) node.maquette.drupal_type = defaults.drupal_type;
    // Migration : paragraphes string -> {code,title,content}
    if (!Array.isArray(node.maquette.paragraphs)) {
      node.maquette.paragraphs = defaults.paragraphs;
    } else {
      node.maquette.paragraphs = node.maquette.paragraphs.map(normalizeParagraph).filter(Boolean);
    }
    if (!node.maquette.taxonomy || typeof node.maquette.taxonomy !== 'object') {
      node.maquette.taxonomy = defaults.taxonomy;
    } else {
      const tax = node.maquette.taxonomy;
      if (typeof tax.univers !== 'string') tax.univers = defaults.taxonomy.univers || '';
      if (!Array.isArray(tax.cibles))  tax.cibles  = defaults.taxonomy.cibles  || [];
      if (!Array.isArray(tax.mesures)) tax.mesures = defaults.taxonomy.mesures || [];
      // Champs supprimés : on ne les expose plus, mais on les laisse dans le
      // JSON stocké côté serveur (pas de suppression destructive).
    }
  }
  for (const c of (node.children ?? [])) ensureMaquette(c, [...parents, node]);
}

// ---- Rendering : fil d'Ariane et mega-menu ----

function isInSubtree(node, targetId) {
  if (node.id === targetId) return true;
  for (const c of node.children ?? []) if (isInSubtree(c, targetId)) return true;
  return false;
}

// Mega-menu DSFR (fr-nav) : navbar horizontale, chaque entrée de premier
// niveau avec enfants ouvre un panneau déroulant qui se superpose au contenu.
function renderMegaMenu() {
  const el = document.getElementById('maquette-nav');
  if (!el || !state.tree) return;
  el.innerHTML = '';

  const ul = document.createElement('ul');
  ul.className = 'maquette-nav__list';

  // Entrée "Accueil" pointant sur la racine
  ul.appendChild(buildNavItem(state.tree, { isHome: true }));

  // Une entrée par enfant direct de la racine
  for (const child of state.tree.children ?? []) {
    ul.appendChild(buildNavItem(child));
  }

  el.appendChild(ul);
}

function buildNavItem(node, { isHome = false } = {}) {
  const li = document.createElement('li');
  li.className = 'maquette-nav__item';
  const hasChildren = !isHome && (node.children ?? []).length > 0;
  const isCurrent = node.id === state.currentId;
  const isOnPath = !isHome && isInSubtree(node, state.currentId);
  const isOpen = state.openMenuId === node.id;
  if (isOpen) li.classList.add('is-open');
  if (isCurrent) li.classList.add('is-current');
  else if (isOnPath) li.classList.add('is-on-path');

  if (hasChildren) {
    // Un seul bouton : ouvre le panneau ; la nav vers le nœud lui-même se
    // fait via le lien "vue d'ensemble" en haut du panneau.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'maquette-nav__btn';
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.setAttribute('aria-haspopup', 'true');
    btn.innerHTML = `<span>${escapeHtml(node.label)}</span><span class="maquette-nav__chev" aria-hidden="true">▾</span>`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.openMenuId = isOpen ? null : node.id;
      renderMegaMenu();
    });
    li.appendChild(btn);
    if (isOpen) {
      const menu = document.createElement('div');
      menu.className = 'maquette-megamenu';
      menu.appendChild(buildMegaPanel(node));
      li.appendChild(menu);
    }
  } else {
    // Pas d'enfants : lien direct
    const a = document.createElement('a');
    a.href = '#' + node.id;
    a.className = 'maquette-nav__btn';
    a.textContent = isHome ? 'Accueil' : node.label;
    if (isCurrent) a.setAttribute('aria-current', 'page');
    a.addEventListener('click', () => closeAllMenus());
    li.appendChild(a);
  }
  return li;
}

function buildMegaPanel(parent) {
  const inner = document.createElement('div');
  inner.className = 'maquette-megamenu__inner';

  // Lien "Tout voir → parent"
  const head = document.createElement('a');
  head.href = '#' + parent.id;
  head.className = 'maquette-megamenu__head';
  head.innerHTML = `<strong>${escapeHtml(parent.label)}</strong> <span>· vue d'ensemble</span>`;
  head.addEventListener('click', () => closeAllMenus());
  inner.appendChild(head);

  const ul = document.createElement('ul');
  ul.className = 'maquette-megamenu__list';
  for (const child of parent.children ?? []) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + child.id;
    a.className = 'maquette-megamenu__link';
    a.textContent = child.label;
    if (child.id === state.currentId) a.setAttribute('aria-current', 'page');
    a.addEventListener('click', () => closeAllMenus());
    li.appendChild(a);
    // Hint : si l'enfant a lui-même des enfants, indiquer le compte
    const grand = (child.children ?? []).length;
    if (grand) {
      const c = document.createElement('span');
      c.className = 'maquette-megamenu__count';
      c.textContent = `${grand} sous-page${grand > 1 ? 's' : ''}`;
      li.appendChild(c);
    }
    ul.appendChild(li);
  }
  inner.appendChild(ul);
  return inner;
}

function closeAllMenus() {
  if (state.openMenuId !== null) {
    state.openMenuId = null;
    renderMegaMenu();
  }
}

// Fermeture sur clic en dehors / touche ESC
document.addEventListener('click', (e) => {
  if (state.openMenuId === null) return;
  const nav = document.getElementById('maquette-nav');
  if (nav && !nav.contains(e.target)) closeAllMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllMenus();
});

function renderCrumbs(parents, node) {
  const el = document.getElementById('maquette-crumbs');
  if (!el) return;
  el.innerHTML = '';
  const trail = [...parents, node];
  trail.forEach((n, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'maquette-crumbs__sep';
      sep.textContent = '›';
      el.appendChild(sep);
    }
    if (i === trail.length - 1) {
      const span = document.createElement('span');
      span.className = 'maquette-crumbs__current';
      span.textContent = n.label;
      el.appendChild(span);
    } else {
      const a = document.createElement('a');
      a.href = '#' + n.id;
      a.className = 'maquette-crumbs__link';
      a.textContent = n.label;
      el.appendChild(a);
    }
  });
}

// ---- Rendering : la "page" prévisualisée ----

function renderPage(node, parents) {
  const el = document.getElementById('maquette-page');
  el.innerHTML = '';

  // En-tête de page
  const head = document.createElement('header');
  head.className = 'maquette-page__head';
  const typeBadge = document.createElement('span');
  typeBadge.className = 'maquette-page__type drupal-type drupal-type--' + slugify(node.maquette.drupal_type);
  typeBadge.textContent = node.maquette.drupal_type;
  head.appendChild(typeBadge);

  const title = document.createElement('h2');
  title.id = 'maquette-page-title';
  title.className = 'maquette-page__title fr-h2';
  title.textContent = node.label;
  head.appendChild(title);

  if (node.tldr) {
    const chapo = document.createElement('p');
    chapo.className = 'maquette-page__chapo';
    chapo.textContent = node.tldr;
    head.appendChild(chapo);
  }

  // Tags taxo visibles (univers + cibles + mesures)
  const tags = document.createElement('div');
  tags.className = 'maquette-page__tags';
  const tax = node.maquette.taxonomy;
  if (tax.univers) tags.appendChild(makeTag(tax.univers, 'tag-univers'));
  for (const c of tax.cibles) tags.appendChild(makeTag(c, 'tag-cible'));
  for (const m of tax.mesures) tags.appendChild(makeTag(m, 'tag-mesure'));
  if (tags.childElementCount) head.appendChild(tags);
  el.appendChild(head);

  // URL si renvoi sortant
  if (node.url) {
    const ext = document.createElement('p');
    ext.className = 'maquette-page__ext fr-text--sm';
    ext.innerHTML = `Lien sortant : <a href="${escapeHtml(node.url)}" target="_blank" rel="noopener">${escapeHtml(node.url)}</a>`;
    el.appendChild(ext);
  }

  // Paragraphes (réordonnables par drag-and-drop ou ↑/↓ ; titre/contenu éditables)
  const parWrap = document.createElement('div');
  parWrap.className = 'maquette-page__paragraphs';
  const list = node.maquette.paragraphs || [];
  if (list.length === 0) {
    parWrap.appendChild(emptyHint('Aucun paragraphe configuré sur cette page.'));
  } else {
    list.forEach((p, idx) => {
      parWrap.appendChild(renderParagraphPreview(p, node, idx, list.length));
    });
  }
  parWrap.appendChild(renderAddParagraph(node));
  el.appendChild(parWrap);

  // Cartes vers les enfants (navigation interne)
  if ((node.children ?? []).length > 0) {
    const childrenSection = document.createElement('section');
    childrenSection.className = 'maquette-children';
    const h = document.createElement('h3');
    h.className = 'fr-h6';
    h.textContent = `${node.children.length} sous-page${node.children.length > 1 ? 's' : ''} dans cette rubrique`;
    childrenSection.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'maquette-children__grid';
    for (const c of node.children) grid.appendChild(renderChildCard(c));
    childrenSection.appendChild(grid);
    el.appendChild(childrenSection);
  }
}

function renderChildCard(child) {
  const card = document.createElement('a');
  card.href = '#' + child.id;
  card.className = 'maquette-child';
  const t = (child.maquette && child.maquette.drupal_type) || 'Article';
  const badge = document.createElement('span');
  badge.className = 'drupal-type drupal-type--' + slugify(t);
  badge.textContent = t;
  card.appendChild(badge);
  const title = document.createElement('strong');
  title.className = 'maquette-child__title';
  title.textContent = child.label;
  card.appendChild(title);
  if (child.tldr) {
    const desc = document.createElement('span');
    desc.className = 'maquette-child__desc';
    desc.textContent = truncate(child.tldr, 140);
    card.appendChild(desc);
  }
  return card;
}

function renderParagraphPreview(p, node, idx, total) {
  const code = p.code;
  const def = PARAGRAPHS[code];
  const isEditing = state.editingParagraphIdx === idx;
  const box = document.createElement('div');
  box.className = 'paragraph-preview paragraph-preview--' + code + (isEditing ? ' is-editing' : '');
  box.draggable = !isEditing;
  box.dataset.idx = String(idx);

  // Drag-and-drop pour réordonner (désactivé en mode édition)
  if (!isEditing) {
    box.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-paragraph-idx', String(idx));
      box.classList.add('is-dragging');
    });
    box.addEventListener('dragend', () => {
      box.classList.remove('is-dragging');
      document.querySelectorAll('.paragraph-preview').forEach(el => {
        el.classList.remove('drop-before', 'drop-after');
      });
    });
    box.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-paragraph-idx')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = box.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      box.classList.toggle('drop-before', before);
      box.classList.toggle('drop-after', !before);
    });
    box.addEventListener('dragleave', () => {
      box.classList.remove('drop-before', 'drop-after');
    });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('application/x-paragraph-idx'));
      const before = box.classList.contains('drop-before');
      box.classList.remove('drop-before', 'drop-after');
      if (Number.isNaN(from)) return;
      const target = before ? idx : idx + 1;
      moveParagraphTo(node, from, target);
    });
  }

  const head = document.createElement('div');
  head.className = 'paragraph-preview__head';
  const tag = document.createElement('span');
  tag.className = 'paragraph-preview__tag';
  const typeLabel = def ? def.label : code;
  tag.innerHTML = `<span class="paragraph-preview__handle" title="Glisser pour réordonner">⋮⋮</span> ¶ ${escapeHtml(typeLabel)}`;
  head.appendChild(tag);
  if (def) {
    const hint = document.createElement('span');
    hint.className = 'paragraph-preview__hint';
    hint.textContent = def.hint;
    head.appendChild(hint);
  }
  // Toolbar : ✎ ↑ ↓ ×
  const tools = document.createElement('div');
  tools.className = 'paragraph-preview__tools';
  if (!isEditing) {
    tools.appendChild(toolBtn('✎', 'Personnaliser titre / contenu', false, () => startEditParagraph(idx)));
    tools.appendChild(toolBtn('↑', 'Monter', idx === 0, () => moveParagraph(node, idx, -1)));
    tools.appendChild(toolBtn('↓', 'Descendre', idx === total - 1, () => moveParagraph(node, idx, +1)));
    tools.appendChild(toolBtn('×', 'Supprimer', false, () => removeParagraph(node, idx)));
  }
  head.appendChild(tools);
  box.appendChild(head);

  // Si l'utilisateur a personnalisé le titre, l'affiche en h3 sous l'en-tête
  if (!isEditing && p.title) {
    const h = document.createElement('h3');
    h.className = 'paragraph-preview__custom-title';
    h.textContent = p.title;
    box.appendChild(h);
  }

  // Mode édition : éditeur structuré dépendant du schéma
  if (isEditing) {
    box.appendChild(renderParagraphEditor(p, node, idx, typeLabel));
    return box;
  }

  // Mini-rendu spécialisé selon le paragraphe — alimenté par p.data (ou les
  // valeurs par défaut du schéma si l'utilisateur n'a rien personnalisé).
  const body = document.createElement('div');
  body.className = 'paragraph-preview__body';
  const d = dataOrDefaults(p);
  body.innerHTML = renderMockHtml(code, d, p, node);
  box.appendChild(body);
  return box;
}

function renderMockHtml(code, d, p, node) {
  switch (code) {
    case 'accordion':
      return (d || []).map(it =>
        `<details><summary>${escapeHtml(it.q || '(sans question)')}</summary><p class="${it.a ? '' : 'placeholder'}">${escapeHtml(it.a || 'Réponse à rédiger.')}</p></details>`
      ).join('');
    case 'tabs': {
      const items = d || [];
      const active = items[0] || { label: '', content: '' };
      return `
        <div class="tabs-mock">${items.map((it, i) =>
          `<span class="tabs-mock__t${i === 0 ? ' is-active' : ''}">${escapeHtml(it.label || '(onglet)')}</span>`
        ).join('')}</div>
        <p class="${active.content ? '' : 'placeholder'}">${escapeHtml(active.content || 'Contenu de l\'onglet actif…')}</p>`;
    }
    case 'cards-row':
    case 'tiles-row':
      return `<div class="cards-mock">${(d || []).map(it =>
        `<div class="cards-mock__c"><strong>${escapeHtml(it.title || '(sans titre)')}</strong><span>${escapeHtml(it.desc || '')}</span></div>`
      ).join('')}</div>`;
    case 'auto-list':
      return `<p class="placeholder">${escapeHtml(d || `Liste générée automatiquement par taxonomie (ex. tous les contenus tagués ${node.maquette.taxonomy.univers || 'Transverse'}).`)}</p>`;
    case 'summary':
      return `<ul class="summary-mock">${(d || []).map(it => `<li>${escapeHtml(it.text || '—')}</li>`).join('')}</ul>`;
    case 'button': {
      const label = (d && d.label) || 'Accéder au service';
      const url = (d && d.url) || '';
      if (url) return `<a class="fr-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
      return `<button class="fr-btn" type="button" disabled>${escapeHtml(label)}</button>`;
    }
    case 'highlight':
      return `<div class="highlight-mock">${escapeHtml(d || 'Mise en exergue : citation, message-clé, accroche.')}</div>`;
    case 'callout': {
      const title = (d && d.title) || 'À retenir';
      const text  = (d && d.text)  || 'Bloc de mise en avant éditorial.';
      return `<div class="callout-mock"><strong>${escapeHtml(title)}</strong><br>${escapeHtml(text)}</div>`;
    }
    case 'image-text': {
      const alt  = (d && d.alt)  || 'image';
      const text = (d && d.text) || 'Texte associé à l\'image.';
      return `<div class="image-text-mock"><div class="image-text-mock__img">${escapeHtml(alt)}</div><p>${escapeHtml(text)}</p></div>`;
    }
    case 'quote':
      return `<blockquote class="quote-mock">« ${escapeHtml(d || 'Verbatim ou témoignage à intégrer.')} »</blockquote>`;
    case 'table':
      // pour le prototype : description libre, sinon mock générique
      if (d) return `<div class="placeholder">${escapeHtml(d)}</div>`;
      return `<table class="table-mock"><thead><tr><th>Colonne A</th><th>Colonne B</th></tr></thead><tbody><tr><td>—</td><td>—</td></tr><tr><td>—</td><td>—</td></tr></tbody></table>`;
    case 'video': {
      const url = (d && d.url) || '';
      if (url) return `<div class="video-mock">▶ <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color:#fff">${escapeHtml(url)}</a></div>`;
      return `<div class="video-mock">▶ Vidéo embarquée (YouTube / Vimeo / Dailymotion)</div>`;
    }
    case 'download-block':
    case 'download-links':
    case 'cards-download':
      return `<ul class="download-mock">${(d || []).map(it =>
        `<li>📄 ${escapeHtml(it.label || '(sans nom)')}${it.size ? ` <span>· ${escapeHtml(it.size)}</span>` : ''}</li>`
      ).join('')}</ul>`;
    case 'code':
      return `<div class="code-mock">⚠ ${escapeHtml(d || 'Bloc Code (hors SFD) — iframe officielle ou carte interactive. Dev complémentaire à demander à Actimage.')}</div>`;
    default:
      return `<p class="placeholder">Aperçu non disponible pour ce paragraphe.</p>`;
  }
}

function toolBtn(label, title, disabled, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'paragraph-preview__btn';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.disabled = !!disabled;
  if (!disabled) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

// L'édition utilise un brouillon (draft) cloné depuis p ; les inputs écrivent
// directement dans le brouillon (sans re-render à chaque frappe pour préserver
// le focus). Les actions structurelles (ajouter/retirer/réordonner un item)
// déclenchent un re-render.
function startEditParagraph(idx) {
  const p = state.currentNode.maquette.paragraphs[idx];
  state.editingParagraphIdx = idx;
  state.editDraft = {
    title: p.title || '',
    data: p.data !== undefined
      ? JSON.parse(JSON.stringify(p.data))
      : (defaultsFor(p.code) ?? null),
  };
  renderPage(state.currentNode, state.currentParents);
}

function cancelEditParagraph() {
  state.editingParagraphIdx = null;
  state.editDraft = null;
  renderPage(state.currentNode, state.currentParents);
}

function commitEditParagraph(node, idx) {
  const p = node.maquette.paragraphs[idx];
  p.title = (state.editDraft.title || '').trim();
  p.data = state.editDraft.data;
  node.maquette.seeded = false;
  scheduleSave(`Maquette ${node.id} : ¶${idx + 1} édité`);
  state.editingParagraphIdx = null;
  state.editDraft = null;
  renderPage(node, state.currentParents);
}

function resetEditDraftToDefaults(p) {
  state.editDraft.data = defaultsFor(p.code) ?? null;
  renderPage(state.currentNode, state.currentParents);
}

function renderParagraphEditor(p, node, idx, typeLabel) {
  const wrap = document.createElement('div');
  wrap.className = 'paragraph-preview__edit';
  const draft = state.editDraft;
  const schema = PARAGRAPH_SCHEMAS[p.code];

  // Titre optionnel (heading affiché au-dessus du bloc)
  wrap.appendChild(labeledInput({
    label: 'Titre personnalisé (optionnel)',
    placeholder: 'Affiché en h3 au-dessus du bloc',
    value: draft.title,
    onInput: (v) => { draft.title = v; },
  }));

  // Sous-éditeur dépendant du kind
  if (!schema) {
    const note = document.createElement('p');
    note.className = 'placeholder';
    note.textContent = `Pas d'éditeur structuré pour le type « ${typeLabel} ».`;
    wrap.appendChild(note);
  } else if (schema.kind === 'text') {
    wrap.appendChild(renderTextEditor(p, schema, draft));
  } else if (schema.kind === 'simple') {
    wrap.appendChild(renderSimpleEditor(p, schema, draft));
  } else if (schema.kind === 'items') {
    wrap.appendChild(renderItemsEditor(p, schema, draft));
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'paragraph-preview__edit-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'fr-btn fr-btn--sm fr-icon-check-line fr-btn--icon-left';
  save.textContent = 'Enregistrer';
  save.addEventListener('click', () => commitEditParagraph(node, idx));
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'fr-btn fr-btn--sm fr-btn--secondary';
  cancel.textContent = 'Annuler';
  cancel.addEventListener('click', cancelEditParagraph);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'fr-btn fr-btn--sm fr-btn--tertiary';
  reset.textContent = 'Restaurer les valeurs par défaut';
  reset.addEventListener('click', () => resetEditDraftToDefaults(p));
  actions.append(save, cancel, reset);
  wrap.appendChild(actions);

  return wrap;
}

function renderTextEditor(p, schema, draft) {
  const wrap = document.createElement('div');
  if (typeof draft.data !== 'string') draft.data = '';
  const ph = typeof schema.defaults === 'string' ? schema.defaults : '';
  wrap.appendChild(labeledInput({
    label: 'Contenu',
    placeholder: ph,
    value: draft.data,
    textarea: schema.textarea !== false,
    onInput: (v) => { draft.data = v; },
  }));
  return wrap;
}

function renderSimpleEditor(p, schema, draft) {
  const wrap = document.createElement('div');
  if (!draft.data || typeof draft.data !== 'object' || Array.isArray(draft.data)) {
    draft.data = JSON.parse(JSON.stringify(schema.defaults || {}));
    for (const f of schema.fields) if (!(f.key in draft.data)) draft.data[f.key] = '';
  }
  for (const f of schema.fields) {
    wrap.appendChild(labeledInput({
      label: f.label,
      placeholder: (schema.defaults && schema.defaults[f.key]) || '',
      value: draft.data[f.key] || '',
      type: f.type,
      textarea: !!f.textarea,
      onInput: (v) => { draft.data[f.key] = v; },
    }));
  }
  return wrap;
}

function renderItemsEditor(p, schema, draft) {
  const wrap = document.createElement('div');
  wrap.className = 'items-editor';
  if (!Array.isArray(draft.data)) draft.data = [];

  draft.data.forEach((item, i) => {
    wrap.appendChild(renderItemCard(item, i, schema, draft, p));
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left items-editor__add';
  addBtn.textContent = schema.addLabel || `Ajouter un ${schema.itemLabel || 'élément'}`;
  addBtn.addEventListener('click', () => {
    const blank = {};
    for (const f of schema.fields) blank[f.key] = '';
    draft.data.push(blank);
    renderPage(state.currentNode, state.currentParents);
  });
  wrap.appendChild(addBtn);

  return wrap;
}

function renderItemCard(item, i, schema, draft, p) {
  const card = document.createElement('div');
  card.className = 'items-editor__card';

  const head = document.createElement('div');
  head.className = 'items-editor__head';
  const lab = document.createElement('span');
  lab.className = 'items-editor__num';
  lab.textContent = `${schema.itemLabel || 'Élément'} ${i + 1}`;
  head.appendChild(lab);
  const tools = document.createElement('div');
  tools.className = 'items-editor__tools';
  tools.appendChild(toolBtn('↑', 'Monter', i === 0, () => {
    [draft.data[i - 1], draft.data[i]] = [draft.data[i], draft.data[i - 1]];
    renderPage(state.currentNode, state.currentParents);
  }));
  tools.appendChild(toolBtn('↓', 'Descendre', i === draft.data.length - 1, () => {
    [draft.data[i], draft.data[i + 1]] = [draft.data[i + 1], draft.data[i]];
    renderPage(state.currentNode, state.currentParents);
  }));
  tools.appendChild(toolBtn('×', 'Supprimer', false, () => {
    draft.data.splice(i, 1);
    renderPage(state.currentNode, state.currentParents);
  }));
  head.appendChild(tools);
  card.appendChild(head);

  for (const f of schema.fields) {
    const defaults = (schema.defaults && schema.defaults[i]) || {};
    card.appendChild(labeledInput({
      label: f.label,
      placeholder: defaults[f.key] || '',
      value: item[f.key] || '',
      type: f.type,
      textarea: !!f.textarea,
      onInput: (v) => { item[f.key] = v; },
    }));
  }
  return card;
}

function labeledInput({ label, value, placeholder, type, textarea, onInput }) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-input-group items-editor__field';
  if (label) {
    const l = document.createElement('label');
    l.className = 'fr-label';
    l.textContent = label;
    wrap.appendChild(l);
  }
  const input = textarea
    ? document.createElement('textarea')
    : document.createElement('input');
  input.className = 'fr-input';
  if (!textarea) input.type = type || 'text';
  if (textarea) input.rows = 3;
  input.value = value || '';
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}

function moveParagraph(node, idx, dir) {
  const arr = node.maquette.paragraphs;
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  node.maquette.seeded = false;
  scheduleSave(`Maquette ${node.id} : paragraphes réordonnés`);
  renderPage(node, state.currentParents);
}

function moveParagraphTo(node, from, to) {
  const arr = node.maquette.paragraphs;
  if (from === to || from === to - 1) return;
  const [item] = arr.splice(from, 1);
  const insertAt = from < to ? to - 1 : to;
  arr.splice(insertAt, 0, item);
  node.maquette.seeded = false;
  scheduleSave(`Maquette ${node.id} : paragraphes réordonnés`);
  renderPage(node, state.currentParents);
}

function removeParagraph(node, idx) {
  node.maquette.paragraphs.splice(idx, 1);
  node.maquette.seeded = false;
  scheduleSave(`Maquette ${node.id} : paragraphe retiré`);
  renderPage(node, state.currentParents);
  renderProps(node, state.currentParents);
}

function addParagraph(node, code) {
  if (!code) return;
  node.maquette.paragraphs.push({ code, title: '', data: undefined });
  node.maquette.seeded = false;
  scheduleSave(`Maquette ${node.id} : paragraphe ajouté (${code})`);
  renderPage(node, state.currentParents);
  renderProps(node, state.currentParents);
}

function renderAddParagraph(node) {
  const wrap = document.createElement('div');
  wrap.className = 'paragraph-add';
  const sel = document.createElement('select');
  sel.className = 'fr-select paragraph-add__select';
  sel.setAttribute('aria-label', 'Ajouter un paragraphe');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '+ Ajouter un paragraphe…';
  sel.appendChild(placeholder);
  for (const [code, p] of Object.entries(PARAGRAPHS)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    const v = sel.value;
    sel.value = '';
    if (v) addParagraph(node, v);
  });
  wrap.appendChild(sel);
  return wrap;
}

function makeTag(text, cls) {
  const s = document.createElement('span');
  s.className = 'maquette-tag ' + cls;
  s.textContent = text;
  return s;
}

function emptyHint(text) {
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  return p;
}

function truncate(s, n) {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---- Rendering : panneau d'édition des propriétés ----

function renderProps(node, parents) {
  const el = document.getElementById('maquette-props');
  el.innerHTML = '';

  // Identité du nœud (rappel)
  const idLine = document.createElement('p');
  idLine.className = 'maquette-props__id';
  idLine.innerHTML = `<code>${escapeHtml(node.id)}</code> · <a href="arborescence.html?node=${encodeURIComponent(node.id)}" title="Éditer ce nœud dans l'arborescence">éditer le nœud</a>`;
  el.appendChild(idLine);

  // Drupal type
  el.appendChild(makeSelect({
    label: 'Type de contenu Drupal SFD',
    value: node.maquette.drupal_type,
    options: DRUPAL_TYPES.map(t => ({ value: t, label: t })),
    onChange: (v) => {
      node.maquette.drupal_type = v;
      node.maquette.seeded = false;
      scheduleSave(`Maquette ${node.id} : type → ${v}`);
      renderPage(node, parents);
    },
  }));

  // (Les paragraphes sont gérés dans la preview à gauche : ajout, suppression
  //  et réordonnancement par drag-and-drop ou ↑/↓.)
  const parNote = document.createElement('p');
  parNote.className = 'fr-text--xs maquette-props__hint';
  parNote.textContent = 'Paragraphes : modifiez-les directement dans la preview à gauche.';
  el.appendChild(parNote);

  // Taxonomies
  for (const [key, def] of Object.entries(TAXO)) {
    const tax = node.maquette.taxonomy;
    if (def.multi) {
      el.appendChild(makeChipMulti({
        label: def.label,
        selected: tax[key] || [],
        options: def.options.map(v => ({ value: v, label: v })),
        onChange: (next) => {
          tax[key] = next;
          node.maquette.seeded = false;
          scheduleSave(`Maquette ${node.id} : ${key}`);
          renderPage(node, parents);
        },
      }));
    } else {
      el.appendChild(makeSelect({
        label: def.label,
        value: tax[key],
        options: [{ value: '', label: '— aucun —' }, ...def.options.map(v => ({ value: v, label: v }))],
        onChange: (v) => {
          tax[key] = v;
          node.maquette.seeded = false;
          scheduleSave(`Maquette ${node.id} : ${key} → ${v}`);
          renderPage(node, parents);
        },
      }));
    }
  }

  // Actions : export JSON + reset seed
  const actions = document.createElement('div');
  actions.className = 'maquette-props__actions fr-mt-3w';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'fr-btn fr-btn--sm fr-icon-download-line fr-btn--icon-left';
  exportBtn.textContent = 'Exporter cette page (JSON)';
  exportBtn.addEventListener('click', () => exportSubtreeMaquette(node));
  actions.appendChild(exportBtn);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-refresh-line fr-btn--icon-left';
  reset.textContent = 'Réinitialiser';
  reset.title = 'Remplacer les propriétés par le seed automatique';
  reset.addEventListener('click', () => {
    if (!confirm('Remplacer les propriétés Drupal de cette page par le seed automatique ?')) return;
    node.maquette = seedMaquette(node, parents);
    scheduleSave(`Maquette ${node.id} : reset seed`);
    renderProps(node, parents);
    renderPage(node, parents);
  });
  actions.appendChild(reset);

  el.appendChild(actions);

  if (node.maquette.seeded) {
    const note = document.createElement('p');
    note.className = 'fr-text--xs maquette-props__note';
    note.textContent = '⚙ Valeurs initialisées par seed automatique — à valider.';
    el.appendChild(note);
  }
}

function makeSelect({ label, value, options, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-select-group fr-mb-2w';
  const id = 'sel-' + Math.random().toString(36).slice(2, 8);
  wrap.innerHTML = `<label class="fr-label" for="${id}">${escapeHtml(label)}</label>`;
  const sel = document.createElement('select');
  sel.id = id;
  sel.className = 'fr-select';
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (String(o.value) === String(value || '')) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

function makeChipMulti({ label, selected, options, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'fr-mb-2w chip-multi';
  const lbl = document.createElement('p');
  lbl.className = 'fr-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);

  const chips = document.createElement('div');
  chips.className = 'chip-multi__chips';
  const sel = new Set(selected || []);
  for (const o of options) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (sel.has(o.value) ? ' chip--on' : '');
    chip.textContent = o.label;
    chip.addEventListener('click', () => {
      if (sel.has(o.value)) sel.delete(o.value);
      else sel.add(o.value);
      onChange([...sel]);
      chip.classList.toggle('chip--on');
    });
    chips.appendChild(chip);
  }
  wrap.appendChild(chips);
  return wrap;
}

// ---- Export JSON ----

function subtreeMaquetteData(node) {
  const tax = (node.maquette && node.maquette.taxonomy) || {};
  return {
    id: node.id,
    label: node.label,
    tldr: node.tldr || '',
    drupal_type: node.maquette ? node.maquette.drupal_type : '',
    type_editorial: tax.univers || '',
    public: Array.isArray(tax.cibles) ? tax.cibles : [],
    mesures:  Array.isArray(tax.mesures) ? tax.mesures : [],
    paragraphs: ((node.maquette && node.maquette.paragraphs) || []).map(p => ({
      code: p.code,
      title: p.title || '',
      data: p.data !== undefined ? p.data : null,
    })),
    children: (node.children || []).map(subtreeMaquetteData),
  };
}

function exportSubtreeMaquette(node, filename) {
  const data = subtreeMaquetteData(node);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `maquette-${node.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFullMaquette() {
  if (!state.tree) return;
  const stamp = new Date().toISOString().slice(0, 10);
  exportSubtreeMaquette(state.tree, `maquette-complete-${stamp}.json`);
}

// ---- Routing ----

function navigateTo(id) {
  const found = findNode(id);
  if (!found) {
    location.hash = '#' + state.tree.id;
    return;
  }
  state.currentId = id;
  state.currentNode = found.node;
  state.currentParents = found.parents;
  state.openMenuId = null;
  state.editingParagraphIdx = null;
  state.editDraft = null;
  renderMegaMenu();
  renderCrumbs(found.parents, found.node);
  renderPage(found.node, found.parents);
  renderProps(found.node, found.parents);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncFromHash() {
  const id = decodeURIComponent((location.hash || '').replace(/^#/, '')) || state.tree.id;
  navigateTo(id);
}

window.addEventListener('hashchange', syncFromHash);

// ---- Boot ----

(async function boot() {
  try {
    const { tree } = await collab.fetchTree();
    state.tree = tree;
    ensureMaquette(tree);
  } catch (e) {
    document.getElementById('maquette-page').innerHTML =
      `<p class="panel-empty">Impossible de charger l'arborescence : ${escapeHtml(e.message)}</p>`;
    return;
  }
  setStatus('idle');
  const exportAllBtn = document.getElementById('maquette-export-all');
  if (exportAllBtn) exportAllBtn.addEventListener('click', exportFullMaquette);
  syncFromHash();
})();
