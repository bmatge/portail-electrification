<script setup lang="ts">
// Panneau "Propriétés" du nœud sélectionné en page Maquette.
// Expose dynamiquement la structure CMS du projet (Modèle de données →
// onglet « Structure CMS ») : type de contenu + toutes les taxonomies
// définies, plus les politiques publiques (catalogue Mesures).
//
// Toutes les valeurs vivent dans `node.maquette.taxonomy.*` et sont
// persistées via le tree (updateNode → save).

import { computed } from 'vue';
import type { VocabConfig } from '@latelier/shared';
import MultiSelect from '../ui/MultiSelect.vue';

interface CmsTaxonomy {
  key: string;
  label: string;
  multi?: boolean;
  options: readonly string[];
}
interface CmsStructure {
  content_types: readonly string[];
  taxonomies: readonly CmsTaxonomy[];
}

const props = defineProps<{
  /** Données complètes de la maquette du nœud. */
  maquette: Record<string, unknown> | null;
  /** Vocab du projet (pour fallback de la taxonomy `cibles`). */
  vocab: VocabConfig;
  /** Catalogue des mesures du projet (M1, M2…) — taxonomy `mesures`. */
  mesuresCatalog: ReadonlyArray<{ id: string; label: string }>;
  /** Structure CMS du projet (types de contenu + taxonomies). */
  cmsStructure: CmsStructure;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'update-taxonomy', patch: Record<string, unknown>): void;
  (e: 'edit-attempt'): void;
}>();

const taxonomy = computed<Record<string, unknown>>(() => {
  const m = props.maquette ?? {};
  return (m['taxonomy'] as Record<string, unknown> | undefined) ?? {};
});

function setTaxonomy(key: string, value: unknown): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  emit('update-taxonomy', { ...taxonomy.value, [key]: value });
}

// Type de contenu (lit `content_type` puis `drupal_type` pour la rétrocompat).
const contentTypeValue = computed<string>(() => {
  const v = taxonomy.value['content_type'] ?? taxonomy.value['drupal_type'];
  return typeof v === 'string' ? v : '';
});
function setContentType(e: Event): void {
  setTaxonomy('content_type', (e.target as HTMLSelectElement).value);
}

// Pour une taxonomy donnée, retourne les options à afficher.
// - Si la taxo définit ses propres options dans la Structure CMS → on les utilise
// - Sinon, cas spéciaux : `cibles` → vocab.audiences, `mesures` → mesuresCatalog
function optionsFor(t: CmsTaxonomy): { value: string; label: string }[] {
  if (t.options.length > 0) {
    return t.options.map((o) => ({ value: o, label: o }));
  }
  if (t.key === 'cibles') {
    return props.vocab.audiences.map((a) => ({ value: a.key, label: a.label }));
  }
  if (t.key === 'mesures') {
    return props.mesuresCatalog.map((m) => ({ value: m.id, label: `${m.id} — ${m.label}` }));
  }
  return [];
}

function singleValue(t: CmsTaxonomy): string {
  const v = taxonomy.value[t.key];
  return typeof v === 'string' ? v : '';
}
function multiValue(t: CmsTaxonomy): string[] {
  const v = taxonomy.value[t.key];
  return Array.isArray(v) ? (v as string[]) : [];
}

function setSingle(t: CmsTaxonomy, e: Event): void {
  setTaxonomy(t.key, (e.target as HTMLSelectElement).value);
}
function setMulti(t: CmsTaxonomy, next: string[]): void {
  setTaxonomy(t.key, next);
}
</script>

<template>
  <aside class="maquette-props l-card">
    <h3 class="maquette-props__title">Propriétés</h3>

    <div v-if="cmsStructure.content_types.length" class="field">
      <label class="fr-label">Type de contenu</label>
      <select
        class="fr-select fr-select--sm"
        :value="contentTypeValue"
        :disabled="!canEdit"
        @change="setContentType"
      >
        <option value="">— aucun —</option>
        <option v-for="ct in cmsStructure.content_types" :key="ct" :value="ct">{{ ct }}</option>
      </select>
    </div>

    <div v-for="t in cmsStructure.taxonomies" :key="t.key" class="field">
      <label class="fr-label">
        {{ t.label }}
        <span v-if="t.multi" class="maquette-props__multi-badge">multi</span>
      </label>
      <p
        v-if="optionsFor(t).length === 0"
        class="fr-text--xs"
        style="color: #888; margin: 0.2rem 0"
      >
        Aucune option définie. Ajoutez-en dans le
        <RouterLink :to="{ name: 'project-data', query: { tab: 'cms' } }">
          Modèle de données </RouterLink
        >.
      </p>
      <template v-else>
        <select
          v-if="!t.multi"
          class="fr-select fr-select--sm"
          :value="singleValue(t)"
          :disabled="!canEdit"
          @change="(e) => setSingle(t, e)"
        >
          <option value="">— aucun —</option>
          <option v-for="o in optionsFor(t)" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
        <MultiSelect
          v-else
          :options="optionsFor(t)"
          :selected="multiValue(t)"
          :disabled="!canEdit"
          :placeholder="`Choisir des ${t.label.toLowerCase()}…`"
          @update:selected="(next) => setMulti(t, next)"
        />
      </template>
    </div>

    <p
      v-if="!cmsStructure.taxonomies.length && !cmsStructure.content_types.length"
      style="color: #888; font-size: 0.85rem"
    >
      Aucune structure CMS configurée. Définissez les types de contenu et les taxonomies dans
      <RouterLink :to="{ name: 'project-data', query: { tab: 'cms' } }"
        >Modèle de données</RouterLink
      >.
    </p>
  </aside>
</template>

<style scoped>
.maquette-props {
  /* Sticky sans overflow interne : si le panneau dépasse la viewport
   * (beaucoup de taxonomies + multi-select ouvert), on scrolle la page. */
  position: sticky;
  top: 5rem;
  align-self: start;
}
.maquette-props__title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-title-grey, #161616);
}
.field {
  margin-bottom: 1rem;
}
.fr-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-default-grey, #161616);
  margin-bottom: 0.3rem;
}
.maquette-props__multi-badge {
  background: var(--background-alt-blue-france, #e3e3fd);
  color: var(--text-action-high-blue-france, #00146b);
  padding: 0 0.4rem;
  border-radius: 3px;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
}
</style>
