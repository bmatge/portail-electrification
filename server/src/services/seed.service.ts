// Données de seed et seed du projet historique (id=1). Préserve les défauts
// hardcodés de l'app v1 pour rester compatible avec la prod existante.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kdb } from '../db/client.js';
import { ensureSystemUser } from '../repositories/user.repo.js';
import { getHeadRevision, insertRevision } from '../repositories/revision.repo.js';
import {
  getHeadRoadmapRevision,
  insertRoadmapRevision,
} from '../repositories/roadmap-revision.repo.js';
import { insertProjectDataIfMissing } from '../repositories/project-data.repo.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS_DATA = resolve(here, '../../../assets/data');

// LEGACY_VOCAB = ce qui était hardcodé dans le code historique (plan
// d'électrification : 9 publics, 4 échéances 2026-2027, 10 types de nœud).
// Sert à initialiser rétroactivement le projet 1 et tout projet existant qui
// n'aurait pas encore de clé vocab — pour ne casser aucune référence.
export const LEGACY_VOCAB = {
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
} as const;

export const DEFAULT_VOCAB = {
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
} as const;

export const DEFAULT_DRUPAL_STRUCTURE = {
  content_types: ['Accueil', 'Rubrique', 'Article', 'Page neutre', 'Webform', 'Hors SFD'],
  paragraphs: [
    'accordion',
    'tabs',
    'cards-row',
    'tiles-row',
    'auto-list',
    'summary',
    'button',
    'highlight',
    'callout',
    'image-text',
    'quote',
    'table',
    'video',
    'download-block',
    'download-links',
    'cards-download',
    'code',
  ],
  paragraph_labels: {},
  taxonomies: [
    {
      key: 'univers',
      label: 'Type éditorial',
      multi: false,
      options: ['Actualité', 'Page rubrique', 'Fiche pratique', 'Outil ou simulateur'],
    },
    {
      key: 'cibles',
      label: 'Public',
      multi: true,
      options: ['Tous publics'],
    },
    {
      key: 'mesures',
      label: 'Politique publique',
      multi: true,
      options: [],
    },
  ],
} as const;

function readJsonOrNull<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export async function seedDefaultProject(k: Kdb): Promise<void> {
  const sysUser = await ensureSystemUser(k);
  const projectId = 1;

  if (!(await getHeadRevision(k, projectId))) {
    const seed = readJsonOrNull<{
      readonly id: string;
      readonly label: string;
      readonly type: string;
      readonly tldr: string;
      readonly children: readonly unknown[];
    }>(resolve(ASSETS_DATA, 'tree.json')) ?? {
      id: 'root',
      label: 'Racine',
      type: 'hub',
      tldr: '',
      children: [],
    };
    await insertRevision(k, {
      projectId,
      parentId: null,
      treeJson: JSON.stringify(seed),
      authorId: sysUser.id,
      message: 'Initialisation depuis tree.json',
    });
  }

  if (!(await getHeadRoadmapRevision(k, projectId))) {
    const seed = readJsonOrNull<{ meta: unknown; items: readonly unknown[] }>(
      resolve(ASSETS_DATA, 'roadmap.json'),
    ) ?? { meta: {}, items: [] };
    await insertRoadmapRevision(k, {
      projectId,
      parentId: null,
      dataJson: JSON.stringify(seed),
      authorId: sysUser.id,
      message: 'Initialisation depuis roadmap.json',
    });
  }

  const catalogSeeds: ReadonlyArray<readonly [string, string]> = [
    ['dispositifs', resolve(ASSETS_DATA, 'dispositifs.json')],
    ['mesures', resolve(ASSETS_DATA, 'mesures.json')],
    ['objectifs', resolve(ASSETS_DATA, 'objectifs.json')],
  ];
  for (const [key, path] of catalogSeeds) {
    const data = readJsonOrNull<unknown>(path);
    if (data == null) continue;
    await insertProjectDataIfMissing(k, projectId, key, JSON.stringify(data), sysUser.id);
  }
  await insertProjectDataIfMissing(
    k,
    projectId,
    'drupal_structure',
    JSON.stringify(DEFAULT_DRUPAL_STRUCTURE),
    sysUser.id,
  );
  await insertProjectDataIfMissing(k, projectId, 'vocab', JSON.stringify(LEGACY_VOCAB), sysUser.id);
}
