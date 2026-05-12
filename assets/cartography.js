// Shared list+detail editor for the dispositifs page.
// Each page calls setup(config) with its own data shape and field definitions.

export function setup(config) {
  const state = {
    data: null,
    selectedId: null,
    filters: {},
    search: '',
  };

  const listEl    = document.getElementById('list');
  const panelEl   = document.getElementById('panel');
  const counterEl = document.getElementById('counter');
  const searchEl  = document.getElementById('search-input');

  // ---- Storage ----

  function load() {
    try {
      const raw = localStorage.getItem(config.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function save() {
    localStorage.setItem(config.storageKey, JSON.stringify(state.data));
  }

  // ---- Data helpers ----

  const itemsOf = () => state.data?.[config.itemsKey] ?? [];
  const findItem = (id) => itemsOf().find(x => x.id === id);

  function newId() {
    const prefix = config.idPrefix || 'X';
    let n = 1;
    while (findItem(`${prefix}-${String(n).padStart(2, '0')}`)) n++;
    return `${prefix}-${String(n).padStart(2, '0')}`;
  }

  // ---- Filters ----

  function matches(item) {
    const term = state.search.trim().toLowerCase();
    if (term) {
      const haystack = JSON.stringify(item).toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    for (const f of config.filters) {
      const value = state.filters[f.selectId];
      if (value && value !== 'all' && !f.matches(item, value)) return false;
    }
    return true;
  }

  // ---- Rendering ----

  function render() {
    listEl.innerHTML = '';
    let items = itemsOf().slice();
    if (config.sort) items = config.sort(items);
    const visible = items.filter(matches);

    for (const item of visible) {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.setAttribute('role', 'listitem');
      if (item.id === state.selectedId) card.classList.add('selected');
      card.innerHTML = '';
      config.renderListCard(card, item);
      card.addEventListener('click', () => {
        state.selectedId = item.id;
        render();
        renderPanel();
      });
      listEl.appendChild(card);
    }

    counterEl.textContent = `${visible.length} affiché${visible.length > 1 ? 's' : ''} sur ${items.length}.`;
    renderPanel();
  }

  function renderPanel() {
    if (!state.selectedId || !findItem(state.selectedId)) {
      panelEl.innerHTML = '<p class="panel-empty">Sélectionnez un élément dans la liste.</p>';
      return;
    }
    const item = findItem(state.selectedId);
    panelEl.innerHTML = '';

    const id = document.createElement('p');
    id.className = 'panel-id';
    id.textContent = `id : ${item.id}`;
    panelEl.appendChild(id);

    // Top action row
    const actions = document.createElement('div');
    actions.className = 'panel-actions panel-actions--top';
    actions.appendChild(button('Supprimer', 'fr-btn--tertiary fr-icon-delete-line fr-btn--icon-left', () => {
      if (!confirm(`Supprimer « ${item.name || item.id} » ?`)) return;
      const items = itemsOf();
      items.splice(items.indexOf(item), 1);
      state.selectedId = null;
      save(); render();
    }));
    panelEl.appendChild(actions);

    for (const field of config.detailFields) {
      panelEl.appendChild(renderField(item, field));
    }

    if (typeof config.renderExtraDetail === 'function') {
      const extra = config.renderExtraDetail(item, { render, renderPanel });
      if (extra) panelEl.appendChild(extra);
    }
  }

  function renderField(item, field) {
    if (field.kind === 'select') {
      const wrap = document.createElement('div');
      wrap.className = 'fr-select-group';
      const label = document.createElement('label');
      label.className = 'fr-label';
      const inputId = `field-${field.key}`;
      label.setAttribute('for', inputId);
      label.textContent = field.label;
      wrap.appendChild(label);
      const select = document.createElement('select');
      select.className = 'fr-select';
      select.id = inputId;
      const options = typeof field.options === 'function' ? field.options(state.data) : field.options;
      const opts = [['', '— non défini —'], ...options.map(o => [o, o])];
      for (const [val, txt] of opts) {
        const o = document.createElement('option');
        o.value = val; o.textContent = txt;
        if (val === (item[field.key] || '')) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => {
        item[field.key] = select.value;
        save(); render();
      });
      wrap.appendChild(select);
      return wrap;
    }
    if (field.kind === 'list') {
      const wrap = document.createElement('div');
      wrap.className = 'fr-input-group';
      const label = document.createElement('label');
      label.className = 'fr-label';
      const inputId = `field-${field.key}`;
      label.setAttribute('for', inputId);
      label.textContent = `${field.label} (séparés par des virgules)`;
      wrap.appendChild(label);
      const input = document.createElement('input');
      input.className = 'fr-input';
      input.id = inputId;
      input.type = 'text';
      input.value = (item[field.key] || []).join(', ');
      input.addEventListener('input', () => {
        item[field.key] = input.value.split(',').map(s => s.trim()).filter(Boolean);
        save();
      });
      wrap.appendChild(input);
      return wrap;
    }
    // input or textarea
    const wrap = document.createElement('div');
    wrap.className = 'fr-input-group';
    const label = document.createElement('label');
    label.className = 'fr-label';
    const inputId = `field-${field.key}`;
    label.setAttribute('for', inputId);
    label.textContent = field.label;
    wrap.appendChild(label);
    const el = document.createElement(field.kind === 'textarea' ? 'textarea' : 'input');
    el.id = inputId;
    el.className = 'fr-input';
    if (field.kind !== 'textarea') el.type = field.type || 'text';
    if (field.kind === 'textarea') el.rows = field.rows || 4;
    el.value = item[field.key] || '';
    el.addEventListener('input', () => {
      item[field.key] = el.value;
      save();
      if (field.key === 'name' || field.key === 'category' || field.key === 'criticite' || field.key === 'audience') render();
    });
    wrap.appendChild(el);
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

  // ---- Filter UI ----

  function populateFilters() {
    for (const f of config.filters) {
      const select = document.getElementById(f.selectId);
      if (!select || !f.populate) continue;
      // Preserve existing first option (e.g. "Toutes")
      const existing = [...select.options].map(o => o.value);
      for (const value of f.populate(itemsOf())) {
        if (!existing.includes(value)) {
          const opt = document.createElement('option');
          opt.value = value; opt.textContent = value;
          select.appendChild(opt);
        }
      }
      select.addEventListener('change', () => {
        state.filters[f.selectId] = select.value;
        render();
      });
    }
  }

  // ---- Toolbar ----

  function exportJson() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = config.exportFilename || 'cartography.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed[config.itemsKey])) throw new Error('Format invalide');
        state.data = parsed;
        state.selectedId = null;
        save(); render();
      } catch (e) {
        alert('Import impossible : ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      switch (action) {
        case 'add': {
          const item = config.newItem(newId());
          itemsOf().push(item);
          state.selectedId = item.id;
          save(); render();
          break;
        }
        case 'export': exportJson(); break;
        case 'import':
          document.getElementById('import-file').click();
          break;
        case 'reset':
          if (!confirm('Réinitialiser la cartographie aux données par défaut ?')) break;
          fetchDefault().then(d => {
            state.data = d;
            state.selectedId = null;
            save(); render();
          });
          break;
      }
    });
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importJson(file);
    e.target.value = '';
  });

  searchEl.addEventListener('input', (e) => {
    state.search = e.target.value;
    render();
  });

  // ---- Boot ----

  async function fetchDefault() {
    const res = await fetch(config.dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function init() {
    listEl.innerHTML = '<p class="panel-empty">Chargement…</p>';
    try {
      state.data = load() ?? await fetchDefault();
    } catch (e) {
      listEl.innerHTML = `<p class="panel-empty">Impossible de charger ${config.dataUrl} : ${e.message}. Servez le projet via un serveur HTTP.</p>`;
      return;
    }
    populateFilters();
    render();
  }

  init();
}
