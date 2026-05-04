import { setup } from './cartography.js';

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
});

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = `item-badge ${cls}`;
  b.textContent = text;
  return b;
}
