// 17 schémas DSFR pour la page Maquette. Extraits du legacy
// `assets/maquette.js` (PARAGRAPH_SCHEMAS) — source unique pour back et
// front. Chaque schéma a un `kind` qui détermine la forme de la donnée :
//   - 'simple'  : objet { field1, field2... }
//   - 'items'   : tableau d'objets [{ field1, field2 }, ...]
//   - 'text'    : string brute (éditable en input ou textarea)

export type ParagraphKind = 'simple' | 'items' | 'text';

export interface ParagraphField {
  readonly key: string;
  readonly label: string;
  readonly textarea?: boolean;
  readonly type?: string;
}

export interface ParagraphSchema {
  readonly kind: ParagraphKind;
  readonly fields?: readonly ParagraphField[];
  readonly itemLabel?: string;
  readonly addLabel?: string;
  readonly textarea?: boolean;
  readonly defaults?: unknown;
}

export const PARAGRAPH_SCHEMAS: Readonly<Record<string, ParagraphSchema>> = {
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
      { label: 'Objectif', content: "Contenu de l'onglet actif…" },
      { label: 'Pour qui', content: '' },
      { label: 'Quand', content: '' },
      { label: 'Comment', content: '' },
      { label: 'Quel gain', content: '' },
    ],
  },
  'cards-row': {
    kind: 'items',
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'desc', label: 'Description', textarea: true },
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
      { key: 'desc', label: 'Description', textarea: true },
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
    fields: [
      { key: 'label', label: 'Libellé' },
      { key: 'size', label: 'Taille' },
    ],
    itemLabel: 'Fichier',
    addLabel: 'Ajouter un fichier',
    defaults: [
      { label: 'document_1.pdf', size: '1,2 Mo' },
      { label: 'document_2.pdf', size: '0,8 Mo' },
    ],
  },
  'download-links': {
    kind: 'items',
    fields: [
      { key: 'label', label: 'Libellé' },
      { key: 'size', label: 'Taille' },
    ],
    itemLabel: 'Lien',
    addLabel: 'Ajouter un lien',
    defaults: [
      { label: 'document_1.pdf', size: '1,2 Mo' },
      { label: 'document_2.pdf', size: '0,8 Mo' },
    ],
  },
  'cards-download': {
    kind: 'items',
    fields: [
      { key: 'label', label: 'Libellé' },
      { key: 'size', label: 'Taille' },
    ],
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
      { key: 'url', label: 'URL de destination', type: 'url' },
    ],
    defaults: { label: 'Accéder au service', url: '' },
  },
  callout: {
    kind: 'simple',
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'text', label: 'Texte', textarea: true },
    ],
    defaults: { title: 'À retenir', text: 'Bloc de mise en avant éditorial.' },
  },
  'image-text': {
    kind: 'simple',
    fields: [
      { key: 'alt', label: 'Description / légende image' },
      { key: 'text', label: 'Texte associé', textarea: true },
    ],
    defaults: { alt: 'image', text: "Texte associé à l'image." },
  },
  video: {
    kind: 'simple',
    fields: [{ key: 'url', label: 'URL (YouTube / Vimeo / Dailymotion)' }],
    defaults: { url: '' },
  },
  highlight: {
    kind: 'text',
    textarea: true,
    defaults: 'Mise en exergue : citation, message-clé, accroche.',
  },
  quote: { kind: 'text', textarea: true, defaults: 'Verbatim ou témoignage à intégrer.' },
  'auto-list': { kind: 'text', textarea: false, defaults: '' },
  code: {
    kind: 'text',
    textarea: true,
    defaults: 'Bloc Code (hors SFD) — iframe officielle ou carte interactive.',
  },
  table: { kind: 'text', textarea: true, defaults: '' },
};

export const PARAGRAPH_LABELS: Readonly<Record<string, string>> = {
  accordion: 'Accordéon',
  tabs: 'Onglets',
  'cards-row': 'Rangée de cartes',
  'tiles-row': 'Rangée de tuiles',
  summary: 'Sommaire',
  'download-block': 'Bloc téléchargement',
  'download-links': 'Liens téléchargement',
  'cards-download': 'Cartes téléchargement',
  button: 'Bouton',
  callout: 'Encadré',
  'image-text': 'Image + texte',
  video: 'Vidéo',
  highlight: 'Mise en exergue',
  quote: 'Citation',
  'auto-list': 'Liste auto',
  code: 'Bloc Code',
  table: 'Tableau',
};

export function defaultsFor(code: string): unknown {
  const s = PARAGRAPH_SCHEMAS[code];
  if (!s || s.defaults === undefined) return undefined;
  return JSON.parse(JSON.stringify(s.defaults));
}
