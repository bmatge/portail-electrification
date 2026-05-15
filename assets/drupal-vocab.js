// Vocabulaires Drupal par défaut, partagés entre la page Maquette et la page
// Structure Drupal. Le front-end conserve toujours cette lib hardcodée comme
// référence ; la config persistée par projet (clé `drupal_structure`) n'en
// stocke que les sous-ensembles activés et les overrides de libellés.

export const DEFAULT_DRUPAL_TYPES = [
  'Accueil',
  'Rubrique',
  'Article',
  'Page neutre',
  'Webform',
  'Hors SFD',
];

// Bibliothèque complète des paragraphes disponibles côté front
// (= codes pour lesquels PARAGRAPH_SCHEMAS est défini dans maquette.js).
export const PARAGRAPH_LIB = {
  accordion:        { label: 'Accordéon',                hint: 'Q/R repliables (vrai/faux, FAQ)' },
  tabs:             { label: 'Onglets',                  hint: 'Sections d\'une page (Objectif, Pour qui, Quand…)' },
  'cards-row':      { label: 'Rangée de cartes',         hint: 'Orientation vers les pages enfants' },
  'tiles-row':      { label: 'Rangée de tuiles',         hint: 'Navigation secondaire' },
  'auto-list':      { label: 'Remontée auto',            hint: 'Liste dynamique par taxonomie' },
  summary:          { label: 'Sommaire',                 hint: 'Table des matières (pages longues)' },
  button:           { label: 'Bouton(s)',                hint: 'CTA / renvoi sortant' },
  highlight:        { label: 'Mise en exergue',          hint: 'Encadré informatif' },
  callout:          { label: 'Bloc de mise en avant',    hint: 'Encadré coloré, accent fort' },
  'image-text':     { label: 'Image et texte',           hint: 'Visuel + texte côte à côte' },
  quote:            { label: 'Citation',                 hint: 'Verbatim, témoignage' },
  table:            { label: 'Tableau',                  hint: 'Données tabulaires' },
  video:            { label: 'Vidéo',                    hint: 'YouTube, Vimeo, Dailymotion' },
  'download-block': { label: 'Bloc de téléchargement',   hint: 'Fichier unique mis en avant' },
  'download-links': { label: 'Liens de téléchargement',  hint: 'Liste de fichiers' },
  'cards-download': { label: 'Cartes de téléchargement', hint: 'Téléchargements en grille' },
  code:             { label: 'Code (hors SFD)',          hint: 'Iframe / carte interactive — dev complémentaire' },
};

// Taxonomies par défaut, sous forme de tableau (ordre stable pour l'UI).
export const DEFAULT_TAXONOMIES = [
  {
    key: 'univers', label: 'Type éditorial', multi: false,
    options: ['Actualité', 'Page rubrique', 'Fiche pratique', 'Fiche mesure', 'Simulateur et outils'],
  },
  {
    key: 'cibles', label: 'Public', multi: true,
    options: ['Tous publics', 'Particuliers', 'Artisans', 'Industriels', 'Agriculteurs', 'Collectivités'],
  },
  {
    key: 'mesures', label: 'Mesure', multi: true,
    options: Array.from({ length: 22 }, (_, i) => `M${i + 1}`),
  },
];

// Structure complète par défaut (mirror du seed serveur `DEFAULT_DRUPAL_STRUCTURE`).
export function defaultDrupalStructure() {
  return {
    content_types: [...DEFAULT_DRUPAL_TYPES],
    paragraphs: Object.keys(PARAGRAPH_LIB),
    paragraph_labels: {},
    taxonomies: DEFAULT_TAXONOMIES.map(t => ({ ...t, options: [...t.options] })),
  };
}

// Résout les vocabulaires effectivement utilisés par la page Maquette à partir
// d'une config persistée (ou null → tout par défaut).
// Retourne { drupalTypes, paragraphs, taxo } avec la même forme que les
// constantes historiques de maquette.js.
export function resolveVocab(config) {
  const safe = config && typeof config === 'object' ? config : {};

  const drupalTypes = Array.isArray(safe.content_types) && safe.content_types.length
    ? [...safe.content_types]
    : [...DEFAULT_DRUPAL_TYPES];

  const enabledCodes = Array.isArray(safe.paragraphs) && safe.paragraphs.length
    ? safe.paragraphs.filter(code => PARAGRAPH_LIB[code])
    : Object.keys(PARAGRAPH_LIB);
  const overrides = (safe.paragraph_labels && typeof safe.paragraph_labels === 'object')
    ? safe.paragraph_labels : {};
  const paragraphs = {};
  for (const code of enabledCodes) {
    const ref = PARAGRAPH_LIB[code];
    paragraphs[code] = {
      label: overrides[code] && String(overrides[code]).trim() || ref.label,
      hint: ref.hint,
    };
  }

  const taxoList = Array.isArray(safe.taxonomies) && safe.taxonomies.length
    ? safe.taxonomies : DEFAULT_TAXONOMIES;
  const taxo = {};
  for (const t of taxoList) {
    if (!t || !t.key) continue;
    taxo[t.key] = {
      label: t.label || t.key,
      multi: !!t.multi,
      options: Array.isArray(t.options) ? [...t.options] : [],
    };
  }

  return { drupalTypes, paragraphs, taxo };
}
