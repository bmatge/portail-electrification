import { setup } from './cartography.js';

const CRITICITE_RANK = { 'Faible': 0, 'Moyenne': 1, 'Élevée': 2, 'Critique': 3 };

setup({
  storageKey: 'portail-electrification.risques.v1',
  dataUrl: 'assets/data/risques.json',
  itemsKey: 'risks',
  idPrefix: 'R-N',
  exportFilename: 'risques.json',

  sort: (items) => items.slice().sort((a, b) => {
    const da = CRITICITE_RANK[b.criticite] ?? -1;
    const db = CRITICITE_RANK[a.criticite] ?? -1;
    if (da !== db) return da - db;
    return (a.id || '').localeCompare(b.id || '');
  }),

  filters: [
    {
      selectId: 'filter-category',
      matches: (item, value) => item.category === value,
      populate: (items) => [...new Set(items.map(i => i.category).filter(Boolean))].sort(),
    },
    {
      selectId: 'filter-criticite',
      matches: (item, value) => {
        const min = CRITICITE_RANK[value] ?? 0;
        const itemRank = CRITICITE_RANK[item.criticite] ?? -1;
        if (value === 'Critique') return item.criticite === 'Critique';
        return itemRank >= min;
      },
      populate: () => [],
    },
  ],

  newItem: (id) => ({
    id, category: '', name: 'Nouveau risque', description: '',
    probability: '', impact: '', criticite: '',
    arbitrage: '', acteurs: [], echeance: '',
    detection: '', mitigation: '', commentaire: '',
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
    if (item.category)  meta.appendChild(badge(item.category, 'badge-cat'));
    if (item.criticite) meta.appendChild(criticiteBadge(item.criticite));
    if (item.probability) meta.appendChild(badge(`P : ${item.probability}`, 'badge-prob'));
    if (item.impact)    meta.appendChild(badge(`I : ${item.impact}`, 'badge-imp'));
    card.appendChild(meta);

    if (item.echeance) {
      const p = document.createElement('p');
      p.className = 'item-card__porteur';
      p.textContent = `Échéance : ${item.echeance}`;
      card.appendChild(p);
    }
  },

  detailFields: [
    { key: 'name',        label: 'Nom du risque',                       kind: 'input' },
    { key: 'category',    label: 'Catégorie',                            kind: 'select',
      options: ['Stratégique', 'Gouvernance', 'Technique', 'Opérationnel', 'Juridique', 'Politique', 'Impact'] },
    { key: 'description', label: 'Description',                          kind: 'textarea', rows: 4 },
    { key: 'probability', label: 'Probabilité',                          kind: 'select',
      options: ['Faible', 'Moyenne', 'Élevée', 'Très élevée'] },
    { key: 'impact',      label: 'Impact',                               kind: 'select',
      options: ['Faible', 'Moyen', 'Élevé', 'Très élevé'] },
    { key: 'criticite',   label: 'Criticité',                            kind: 'select',
      options: ['Faible', 'Moyenne', 'Élevée', 'Critique'] },
    { key: 'arbitrage',   label: 'Arbitrage proposé',                    kind: 'textarea', rows: 3 },
    { key: 'acteurs',     label: 'Acteurs concernés',                    kind: 'list' },
    { key: 'echeance',    label: 'Échéance',                              kind: 'input' },
    { key: 'detection',   label: 'Signaux de détection',                  kind: 'textarea', rows: 2 },
    { key: 'mitigation',  label: 'Mitigation',                            kind: 'textarea', rows: 3 },
    { key: 'commentaire', label: 'Commentaire / notes',                   kind: 'textarea', rows: 4 },
  ],
});

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = `item-badge ${cls}`;
  b.textContent = text;
  return b;
}

function criticiteBadge(value) {
  const map = { 'Faible': 'low', 'Moyenne': 'medium', 'Élevée': 'high', 'Critique': 'critical' };
  const b = document.createElement('span');
  b.className = `item-badge crit-${map[value] ?? 'low'}`;
  b.textContent = value;
  return b;
}
