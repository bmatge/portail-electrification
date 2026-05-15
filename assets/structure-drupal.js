// Page d'édition des vocabulaires Drupal d'un projet.
// Charge / persiste la clé `drupal_structure` via collab.fetchData/saveData.
// La page Maquette lit ces vocabulaires pour ses listes déroulantes et chips.

import { collab, ensureIdentified, escapeHtml } from './collab.js';
import {
  PARAGRAPH_LIB,
  DEFAULT_DRUPAL_TYPES,
  defaultDrupalStructure,
} from './drupal-vocab.js';
import {
  LEGACY_VOCAB,
  DEFAULT_VOCAB,
  applyVocab,
  saveVocab,
  slugify,
  uniqueKey,
} from './vocab.js';

// ---- État ----

// Identifiants stables des accordéons (ordre = ordre d'affichage). Sert au
// bouton « Tout déplier / Tout replier » dans la barre d'outils.
const ALL_SECTIONS = ['audiences', 'deadlines', 'page_types', 'content_types', 'paragraphs', 'taxonomies'];

const state = {
  config: null, // { content_types, paragraphs, paragraph_labels, taxonomies }
  vocab:  null, // { audiences, deadlines, page_types }
  // Sections actuellement ouvertes ; persisté entre re-renders pour ne pas
  // refermer un accordéon que l'utilisateur vient d'ouvrir. Vide par défaut.
  openSections: new Set(),
};

let saveTimer = null;
let vocabSaveTimer = null;

function scheduleSave() {
  setStatus('saving');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
}

async function flushSave() {
  try {
    await collab.saveData('drupal_structure', state.config);
    setStatus('saved');
  } catch (e) {
    if (e.status === 401) {
      await ensureIdentified();
      try {
        await collab.saveData('drupal_structure', state.config);
        setStatus('saved');
      } catch (e2) {
        setStatus('error', e2.message);
      }
    } else {
      setStatus('error', e.message);
    }
  }
}

// Le vocab a sa propre debounce et utilise saveVocab() qui met aussi à jour
// les bindings ESM en mémoire (pour que les autres pages voient la nouvelle
// valeur sans reload, le cas échéant).
function scheduleVocabSave() {
  setStatus('saving');
  if (vocabSaveTimer) clearTimeout(vocabSaveTimer);
  vocabSaveTimer = setTimeout(flushVocabSave, 500);
}

async function flushVocabSave() {
  try {
    await saveVocab(state.vocab);
    setStatus('saved');
  } catch (e) {
    if (e.status === 401) {
      await ensureIdentified();
      try {
        await saveVocab(state.vocab);
        setStatus('saved');
      } catch (e2) {
        setStatus('error', e2.message);
      }
    } else {
      setStatus('error', e.message);
    }
  }
}

function setStatus(kind, msg = '') {
  const el = document.getElementById('structure-status');
  if (!el) return;
  el.className = 'maquette-status maquette-status--' + kind;
  el.textContent = ({
    saving: 'Enregistrement…',
    saved:  'Enregistré',
    error:  'Erreur : ' + msg,
    idle:   '',
  })[kind] || '';
}

// ---- Normalisation ----

// Garantit que toutes les clés attendues existent et sont du bon type.
// Sans écraser ce que l'utilisateur a déjà saisi.
function normalize(config) {
  const def = defaultDrupalStructure();
  const out = {
    content_types: Array.isArray(config?.content_types) ? [...config.content_types] : def.content_types,
    paragraphs: Array.isArray(config?.paragraphs) ? [...config.paragraphs] : def.paragraphs,
    paragraph_labels: (config?.paragraph_labels && typeof config.paragraph_labels === 'object')
      ? { ...config.paragraph_labels } : {},
    taxonomies: Array.isArray(config?.taxonomies) ? config.taxonomies.map(t => ({
      key: String(t.key || ''),
      label: String(t.label || t.key || ''),
      multi: !!t.multi,
      options: Array.isArray(t.options) ? [...t.options] : [],
    })).filter(t => t.key) : def.taxonomies,
  };
  return out;
}

// ---- Rendering ----

function render() {
  const root = document.getElementById('structure-root');
  if (!root) return;
  root.innerHTML = '';

  // Vocabulaires de projet : lus aussi par l'arborescence, la roadmap, la
  // page Politiques publiques. Affichés en premier car structurants.
  root.appendChild(renderVocabSection({
    id: 'audiences',
    title: 'Publics cibles',
    hint: 'Audiences ciblées par le projet. Cochées sur chaque nœud de l\'arborescence et héritées dans les enfants.',
    items: state.vocab.audiences,
    placeholder: 'Nouveau public…',
    duplicateMsg: 'Ce public existe déjà.',
    onChange: () => scheduleVocabSave(),
    onMutate: (next) => { state.vocab.audiences = next; },
  }));
  root.appendChild(renderVocabSection({
    id: 'deadlines',
    title: 'Échéances',
    hint: 'Horizons temporels du projet, utilisés par la roadmap (colonnes) et par chaque nœud (deadline).',
    items: state.vocab.deadlines,
    placeholder: 'Nouvelle échéance…',
    duplicateMsg: 'Cette échéance existe déjà.',
    onChange: () => scheduleVocabSave(),
    onMutate: (next) => { state.vocab.deadlines = next; },
  }));
  root.appendChild(renderVocabSection({
    id: 'page_types',
    title: 'Types de nœud',
    hint: 'Catégorisation fonctionnelle des nœuds (hub, éditorial, simulateur…). Différent du « type de page » CMS, qui est ci-dessous.',
    items: state.vocab.page_types,
    placeholder: 'Nouveau type…',
    duplicateMsg: 'Ce type existe déjà.',
    onChange: () => scheduleVocabSave(),
    onMutate: (next) => { state.vocab.page_types = next; },
  }));

  // Modèle CMS (ex-« Structure Drupal »)
  root.appendChild(renderContentTypes());
  root.appendChild(renderParagraphs());
  root.appendChild(renderTaxonomies());
}

// Liste générique de { key, label } éditables. La key est auto-générée du
// label à la création (slugify + uniqueKey) puis figée — l'utilisateur ne
// peut éditer que le label, ce qui garantit qu'aucune référence existante
// (par exemple `node.audiences` qui pointe vers `particuliers`) ne casse.
function renderVocabSection({ id, title, hint, items, placeholder, duplicateMsg, onChange, onMutate }) {
  const card = panel(id, title, hint, items.length);
  const list = document.createElement('div');
  list.className = 'sd-list';

  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'sd-row';

    const keyTag = document.createElement('code');
    keyTag.className = 'sd-vocab__key';
    keyTag.textContent = item.key;
    keyTag.title = `Clé technique : ${item.key} (figée)`;
    row.appendChild(keyTag);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input fr-input--sm';
    input.value = item.label;
    input.setAttribute('aria-label', `Libellé pour ${item.key}`);
    input.addEventListener('input', () => {
      item.label = input.value;
      onChange();
    });
    row.appendChild(input);

    const rm = iconBtn('×', `Supprimer ${item.label}`, () => {
      if (!confirm(`Supprimer « ${item.label} » ? Les nœuds qui référencent la clé "${item.key}" garderont la référence mais elle ne sera plus traduite par l'application.`)) return;
      const next = items.filter((_, i) => i !== idx);
      onMutate(next);
      onChange();
      render();
    });
    row.appendChild(rm);

    list.appendChild(row);
  });
  card.appendChild(list);

  // Zone d'ajout : on saisit le label, la key est dérivée par slugify.
  const addBox = document.createElement('div');
  addBox.className = 'sd-add';
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'fr-input fr-input--sm';
  addInput.placeholder = placeholder;
  addInput.setAttribute('aria-label', `Ajouter une entrée : ${title}`);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left';
  addBtn.textContent = 'Ajouter';
  const doAdd = () => {
    const label = addInput.value.trim();
    if (!label) return;
    if (items.some(it => it.label.toLowerCase() === label.toLowerCase())) {
      setStatus('error', duplicateMsg);
      return;
    }
    const taken = new Set(items.map(it => it.key));
    const key = uniqueKey(label, taken);
    const next = [...items, { key, label }];
    onMutate(next);
    addInput.value = '';
    onChange();
    render();
  };
  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  addBox.append(addInput, addBtn);
  card.appendChild(addBox);

  return card.parentElement; // returns the <details>
}

// --- Types de contenu ---

function renderContentTypes() {
  const card = panel('content_types', 'Types de page', 'Les types proposés sur chaque page. Le seed automatique de la maquette mappe les nœuds de l\'arborescence vers ces types.', state.config.content_types.length);
  const list = document.createElement('div');
  list.className = 'sd-list';

  state.config.content_types.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'sd-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input fr-input--sm';
    input.value = name;
    input.setAttribute('aria-label', `Type de contenu ${idx + 1}`);
    input.addEventListener('input', () => {
      state.config.content_types[idx] = input.value;
      scheduleSave();
    });
    row.appendChild(input);

    const rm = iconBtn('×', 'Supprimer ce type', () => {
      state.config.content_types.splice(idx, 1);
      scheduleSave();
      render();
    });
    row.appendChild(rm);

    list.appendChild(row);
  });

  card.appendChild(list);

  const addBox = document.createElement('div');
  addBox.className = 'sd-add';
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'fr-input fr-input--sm';
  addInput.placeholder = 'Nouveau type de contenu…';
  addInput.setAttribute('aria-label', 'Ajouter un type de contenu');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left';
  addBtn.textContent = 'Ajouter';
  const doAdd = () => {
    const v = addInput.value.trim();
    if (!v) return;
    if (state.config.content_types.includes(v)) {
      setStatus('error', 'Ce type existe déjà.');
      return;
    }
    state.config.content_types.push(v);
    addInput.value = '';
    scheduleSave();
    render();
  };
  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  addBox.append(addInput, addBtn);
  card.appendChild(addBox);

  return card.parentElement;
}

// --- Composants ---

function renderParagraphs() {
  const card = panel('paragraphs', 'Composants activés', 'Cochez les composants mobilisables sur les pages. Le libellé affiché peut être personnalisé ; le schéma des champs reste hardcodé côté front.', state.config.paragraphs.length);

  const enabled = new Set(state.config.paragraphs);
  const list = document.createElement('div');
  list.className = 'sd-paragraph-list';

  for (const [code, ref] of Object.entries(PARAGRAPH_LIB)) {
    const row = document.createElement('div');
    row.className = 'sd-paragraph-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'fr-checkbox-group__input';
    cb.id = 'p-' + code;
    cb.checked = enabled.has(code);
    cb.addEventListener('change', () => {
      const set = new Set(state.config.paragraphs);
      if (cb.checked) set.add(code); else set.delete(code);
      // Préserver l'ordre de PARAGRAPH_LIB
      state.config.paragraphs = Object.keys(PARAGRAPH_LIB).filter(c => set.has(c));
      scheduleSave();
    });

    const code_el = document.createElement('code');
    code_el.className = 'sd-paragraph-code';
    code_el.textContent = code;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'fr-input fr-input--sm sd-paragraph-label';
    labelInput.placeholder = ref.label;
    labelInput.value = state.config.paragraph_labels[code] || '';
    labelInput.setAttribute('aria-label', `Libellé personnalisé pour ${code}`);
    labelInput.addEventListener('input', () => {
      const v = labelInput.value.trim();
      if (v) state.config.paragraph_labels[code] = v;
      else delete state.config.paragraph_labels[code];
      scheduleSave();
    });

    const hint = document.createElement('span');
    hint.className = 'sd-paragraph-hint';
    hint.textContent = ref.hint;

    row.append(cb, code_el, labelInput, hint);
    list.appendChild(row);
  }

  card.appendChild(list);
  return card.parentElement;
}

// --- Taxonomies ---

function renderTaxonomies() {
  const card = panel('taxonomies', 'Taxonomies', 'Les vocabulaires utilisés pour qualifier chaque page (type éditorial, public, etc.). La clé est l\'identifiant interne — éviter de la modifier si du contenu existe déjà.', state.config.taxonomies.length);

  const wrap = document.createElement('div');
  wrap.className = 'sd-taxo-list';

  state.config.taxonomies.forEach((taxo, idx) => {
    wrap.appendChild(renderOneTaxonomy(taxo, idx));
  });

  card.appendChild(wrap);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fr-btn fr-btn--sm fr-btn--tertiary fr-icon-add-line fr-btn--icon-left';
  addBtn.textContent = 'Ajouter une taxonomie';
  addBtn.addEventListener('click', () => {
    const key = prompt('Clé technique (a-z, 0-9, tiret bas) :');
    if (!key) return;
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      alert('Clé invalide : minuscules, chiffres et tiret bas uniquement.');
      return;
    }
    if (state.config.taxonomies.some(t => t.key === key)) {
      alert('Cette clé est déjà utilisée.');
      return;
    }
    state.config.taxonomies.push({ key, label: key, multi: false, options: [] });
    scheduleSave();
    render();
  });
  card.appendChild(addBtn);

  return card.parentElement;
}

function renderOneTaxonomy(taxo, idx) {
  const box = document.createElement('div');
  box.className = 'sd-taxo';

  const header = document.createElement('div');
  header.className = 'sd-taxo__header';

  const keyTag = document.createElement('code');
  keyTag.className = 'sd-taxo__key';
  keyTag.textContent = taxo.key;
  header.appendChild(keyTag);

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'fr-input fr-input--sm sd-taxo__label';
  labelInput.value = taxo.label;
  labelInput.setAttribute('aria-label', `Libellé de la taxonomie ${taxo.key}`);
  labelInput.addEventListener('input', () => {
    taxo.label = labelInput.value;
    scheduleSave();
  });
  header.appendChild(labelInput);

  const multiWrap = document.createElement('label');
  multiWrap.className = 'sd-taxo__multi';
  const multiCb = document.createElement('input');
  multiCb.type = 'checkbox';
  multiCb.checked = !!taxo.multi;
  multiCb.addEventListener('change', () => {
    taxo.multi = multiCb.checked;
    scheduleSave();
  });
  multiWrap.append(multiCb, document.createTextNode(' multi-valué'));
  header.appendChild(multiWrap);

  const rmBtn = iconBtn('×', `Supprimer la taxonomie ${taxo.key}`, () => {
    if (!confirm(`Supprimer la taxonomie "${taxo.label || taxo.key}" et ses ${taxo.options.length} option(s) ?`)) return;
    state.config.taxonomies.splice(idx, 1);
    scheduleSave();
    render();
  });
  header.appendChild(rmBtn);

  box.appendChild(header);

  // Options
  const optsLabel = document.createElement('p');
  optsLabel.className = 'sd-taxo__opts-label';
  optsLabel.textContent = 'Options';
  box.appendChild(optsLabel);

  const optsList = document.createElement('div');
  optsList.className = 'sd-taxo__opts';
  taxo.options.forEach((opt, oIdx) => {
    const row = document.createElement('div');
    row.className = 'sd-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fr-input fr-input--sm';
    input.value = opt;
    input.setAttribute('aria-label', `Option ${oIdx + 1} de ${taxo.key}`);
    input.addEventListener('input', () => {
      taxo.options[oIdx] = input.value;
      scheduleSave();
    });
    row.appendChild(input);

    const rm = iconBtn('×', 'Supprimer cette option', () => {
      taxo.options.splice(oIdx, 1);
      scheduleSave();
      render();
    });
    row.appendChild(rm);
    optsList.appendChild(row);
  });
  box.appendChild(optsList);

  // Ajout option
  const addBox = document.createElement('div');
  addBox.className = 'sd-add';
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'fr-input fr-input--sm';
  addInput.placeholder = 'Nouvelle option…';
  addInput.setAttribute('aria-label', `Ajouter une option à ${taxo.key}`);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left';
  addBtn.textContent = 'Ajouter';
  const doAdd = () => {
    const v = addInput.value.trim();
    if (!v) return;
    if (taxo.options.includes(v)) { setStatus('error', 'Option déjà présente.'); return; }
    taxo.options.push(v);
    addInput.value = '';
    scheduleSave();
    render();
  };
  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  addBox.append(addInput, addBtn);
  box.appendChild(addBox);

  return box;
}

// ---- Helpers UI ----

// Returns the `<div class="panel-accordion__body">` so callers keep their
// existing `card.appendChild(...)` flow. The owning `<details>` is reachable
// via `body.parentElement` and is what should be appended to the page root.
function panel(id, title, hint, count) {
  const details = document.createElement('details');
  details.className = 'panel-accordion sd-panel';
  details.dataset.sectionId = id;
  details.open = state.openSections.has(id);
  details.addEventListener('toggle', () => {
    if (details.open) state.openSections.add(id);
    else state.openSections.delete(id);
    updateToggleAllButton();
  });

  const summary = document.createElement('summary');
  summary.className = 'panel-accordion__summary';
  const txt = document.createElement('span');
  txt.className = 'panel-accordion__title';
  txt.textContent = title;
  summary.appendChild(txt);
  if (typeof count === 'number') {
    const badge = document.createElement('span');
    badge.className = 'panel-accordion__count' + (count > 0 ? '' : ' panel-accordion__count--empty');
    badge.textContent = count;
    summary.appendChild(badge);
  }
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'panel-accordion__body';
  if (hint) {
    const p = document.createElement('p');
    p.className = 'fr-text--sm fr-mb-2w sd-panel__hint';
    p.textContent = hint;
    body.appendChild(p);
  }
  details.appendChild(body);
  return body;
}

function iconBtn(label, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fr-btn fr-btn--tertiary fr-btn--sm sd-icon-btn';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// Met à jour le label du bouton « Tout déplier / Tout replier » selon l'état
// courant : si au moins une section est ouverte, le clic suivant tout fermera.
function updateToggleAllButton() {
  const btn = document.getElementById('structure-toggle-all');
  if (!btn) return;
  const anyOpen = state.openSections.size > 0;
  btn.textContent = anyOpen ? 'Tout replier' : 'Tout déplier';
}

// ---- Boot ----

(async function boot() {
  const root = document.getElementById('structure-root');
  try {
    const [structureRes, vocabRes] = await Promise.all([
      collab.fetchData('drupal_structure'),
      collab.fetchData('vocab').catch(() => ({ data: null })), // tolère l'absence de la clé
    ]);
    state.config = normalize(structureRes.data);
    state.vocab  = normalizeVocab(vocabRes.data);
    // Propage côté assets/vocab.js pour que les autres pages voient l'état
    // courant si l'utilisateur navigue sans recharger.
    applyVocab(state.vocab);
  } catch (e) {
    root.innerHTML = `<p class="panel-empty">Impossible de charger la configuration : ${escapeHtml(e.message)}</p>`;
    return;
  }
  setStatus('idle');

  const resetBtn = document.getElementById('structure-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Réinitialiser le modèle de données et les vocabulaires aux valeurs par défaut ? Les personnalisations actuelles seront perdues.')) return;
      state.config = defaultDrupalStructure();
      state.vocab  = JSON.parse(JSON.stringify(DEFAULT_VOCAB));
      scheduleSave();
      scheduleVocabSave();
      render();
    });
  }

  const toggleAllBtn = document.getElementById('structure-toggle-all');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      if (state.openSections.size > 0) state.openSections.clear();
      else state.openSections = new Set(ALL_SECTIONS);
      render();
      updateToggleAllButton();
    });
  }

  render();
  updateToggleAllButton();
})();

// Garantit que vocab.audiences/deadlines/page_types sont toujours des
// tableaux d'objets { key, label }. Si la clé est absente du JSON, on
// retombe sur LEGACY_VOCAB pour ne pas vider les vocabs en cas de
// désynchronisation.
function normalizeVocab(data) {
  const safe = (data && typeof data === 'object') ? data : {};
  const norm = (list, fallback) => Array.isArray(list)
    ? list.filter(it => it && it.key).map(it => ({ key: String(it.key), label: String(it.label || it.key) }))
    : fallback.map(it => ({ ...it }));
  return {
    audiences:  norm(safe.audiences,  LEGACY_VOCAB.audiences),
    deadlines:  norm(safe.deadlines,  LEGACY_VOCAB.deadlines),
    page_types: norm(safe.page_types, LEGACY_VOCAB.page_types),
  };
}
