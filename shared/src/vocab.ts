// Vocabulaire partagé : helpers slug/uniqueKey + types VocabConfig.
//
// Source de vérité côté front et serveur — utilisé par la page Modèle de
// données pour générer les keys figées à partir du label saisi par
// l'utilisateur.

export interface VocabEntry {
  readonly key: string;
  readonly label: string;
}

export interface VocabConfig {
  readonly audiences: readonly VocabEntry[];
  readonly deadlines: readonly VocabEntry[];
  readonly page_types: readonly VocabEntry[];
}

export const LEGACY_VOCAB: VocabConfig = {
  audiences: [
    { key: 'particuliers', label: 'Particuliers' },
    { key: 'coproprietes', label: 'Copropriétés' },
    { key: 'collectivites', label: 'Collectivités' },
    { key: 'pros', label: 'Pros' },
    { key: 'industriels', label: 'Industriels' },
    { key: 'agriculteurs', label: 'Agriculteurs' },
    { key: 'partenaires', label: 'Partenaires' },
    { key: 'agents', label: 'Agents publics' },
    { key: 'outremer', label: 'Outre-mer' },
  ],
  deadlines: [
    { key: 'juin', label: 'Juin 2026' },
    { key: 'septembre', label: 'Septembre 2026' },
    { key: 'decembre', label: 'Décembre 2026' },
    { key: 'y2027', label: '2027+' },
  ],
  page_types: [
    { key: 'hub', label: 'Hub' },
    { key: 'editorial', label: 'Éditorial' },
    { key: 'service', label: 'Service' },
    { key: 'simulator', label: 'Simulateur' },
    { key: 'map', label: 'Carte' },
    { key: 'external', label: 'Renvoi externe' },
    { key: 'marketplace', label: 'Marketplace' },
    { key: 'kit', label: 'Kit' },
    { key: 'form', label: 'Formulaire' },
    { key: 'private', label: 'Espace privé' },
  ],
};

export const DEFAULT_VOCAB: VocabConfig = {
  audiences: [{ key: 'tous-publics', label: 'Tous publics' }],
  deadlines: [
    { key: 'court-terme', label: 'Court terme' },
    { key: 'moyen-terme', label: 'Moyen terme' },
    { key: 'long-terme', label: 'Long terme' },
  ],
  page_types: [
    { key: 'hub', label: 'Hub' },
    { key: 'editorial', label: 'Éditorial' },
    { key: 'service', label: 'Service' },
  ],
};

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugify(label: string): string {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueKey(label: string, taken: ReadonlySet<string> | readonly string[]): string {
  const set = taken instanceof Set ? taken : new Set(taken);
  let base = slugify(label);
  if (!base) base = 'item';
  if (!set.has(base)) return base;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  throw new Error('uniqueKey_overflow');
}
