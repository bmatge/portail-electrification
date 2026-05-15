// Vocabulaires partagés par les pages arborescence, roadmap, mesures.
// Ces listes sont aujourd'hui hardcodées et calées sur le projet d'origine
// (plan d'électrification : 4 échéances 2026-2027, 9 publics cibles, 10 types
// de nœuds). Une étape ultérieure les rendra éditables par projet via la page
// « Modèle de données ».

export const TYPES = {
  hub:         { label: 'Hub' },
  editorial:   { label: 'Éditorial' },
  service:     { label: 'Service' },
  simulator:   { label: 'Simulateur' },
  map:         { label: 'Carte' },
  external:    { label: 'Renvoi externe' },
  marketplace: { label: 'Marketplace' },
  kit:         { label: 'Kit' },
  form:        { label: 'Formulaire' },
  private:     { label: 'Espace privé' },
};

export const AUDIENCES = {
  particuliers:   'Particuliers',
  coproprietes:   'Copropriétés',
  collectivites:  'Collectivités',
  pros:           'Pros',
  industriels:    'Industriels',
  agriculteurs:   'Agriculteurs',
  partenaires:    'Partenaires',
  agents:         'Agents publics',
  outremer:       'Outre-mer',
};

export const DEADLINES = {
  juin:       'Juin 2026',
  septembre:  'Septembre 2026',
  decembre:   'Décembre 2026',
  y2027:      '2027+',
};

export const DEADLINE_ORDER = ['juin', 'septembre', 'decembre', 'y2027'];
