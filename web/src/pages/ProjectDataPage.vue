<script setup lang="ts">
// Page Modèle de données (fusionne l'ancien onglet "Structure Drupal") :
//   - Onglet Vocabulaires : publics cibles / échéances / types de page
//   - Onglet Structure CMS : types de contenu Drupal, paragraphes
//     activés, taxonomies
//
// Les deux sections persistent dans des clés `project_data` séparées
// (`vocab` / `drupal_structure`).

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  LEGACY_VOCAB,
  slugify,
  uniqueKey,
  type VocabConfig,
  type VocabEntry,
} from '@latelier/shared';
import { useVocabStore, useDrupalStructureStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { useConfirm } from '../stores/confirm.js';
import { useCanEdit } from '../composables/useCanEdit.js';
import PageHeader from '../components/ui/PageHeader.vue';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const vocabStore = useVocabStore();
const drupalStore = useDrupalStructureStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();
const confirmStore = useConfirm();

const activeTab = ref<'vocab' | 'cms'>('vocab');

// État ouvert/fermé de chaque accordéon (par défaut : tout ouvert pour
// vocab tab, premier ouvert pour cms tab).
const openSections = ref<Set<string>>(
  new Set(['vocab-audiences', 'vocab-deadlines', 'vocab-page_types', 'cms-content_types']),
);
function isOpen(id: string): boolean {
  return openSections.value.has(id);
}
function onToggle(id: string, e: Event): void {
  const next = new Set(openSections.value);
  if ((e.target as HTMLDetailsElement).open) next.add(id);
  else next.delete(id);
  openSections.value = next;
}

onMounted(async () => {
  if (slug.value) {
    await Promise.all([vocabStore.hydrate(slug.value), drupalStore.hydrate(slug.value)]);
  }
});
watch(slug, async (s) => {
  if (s) await Promise.all([vocabStore.hydrate(s), drupalStore.hydrate(s)]);
});

const canEdit = useCanEdit('data:write', () => slug.value);

function ensureEditOrModal(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer ce catalogue.");
  return false;
}

// ============= VOCABULAIRES PROJET =============

const vocab = computed<VocabConfig>(() => {
  const data = vocabStore.data as VocabConfig | null;
  if (data && Array.isArray(data.audiences)) return data;
  return LEGACY_VOCAB;
});

type VocabKind = 'audiences' | 'deadlines' | 'page_types';

const KIND_LABELS: Record<
  VocabKind,
  { title: string; subtitle: string; placeholder: string; itemSingular: string }
> = {
  audiences: {
    title: 'Publics cibles',
    subtitle: 'Audiences couvertes par les pages du site (Particuliers, Pros, etc.).',
    placeholder: 'Nouveau public…',
    itemSingular: 'public',
  },
  deadlines: {
    title: 'Échéances',
    subtitle: 'Jalons temporels pour planifier la roadmap (Juin 2026, etc.).',
    placeholder: 'Nouvelle échéance…',
    itemSingular: 'échéance',
  },
  page_types: {
    title: 'Types de page',
    subtitle: 'Catégories de pages (Hub, Éditorial, Service, Simulateur…).',
    placeholder: 'Nouveau type de page…',
    itemSingular: 'type de page',
  },
};

async function saveVocab(next: VocabConfig): Promise<void> {
  vocabStore.setData(next);
  await vocabStore.save();
}

function addVocabEntry(kind: VocabKind, label: string): void {
  if (!ensureEditOrModal()) return;
  const trimmed = label.trim();
  if (!trimmed) return;
  const current = vocab.value;
  const existing = new Set(current[kind].map((e) => e.key));
  const key = uniqueKey(trimmed, existing);
  const nextEntry: VocabEntry = { key, label: trimmed };
  void saveVocab({ ...current, [kind]: [...current[kind], nextEntry] });
}

function renameVocabEntry(kind: VocabKind, index: number, newLabel: string): void {
  if (!ensureEditOrModal()) return;
  const current = vocab.value;
  const list = [...current[kind]];
  const existing = list[index];
  if (!existing) return;
  list[index] = { key: existing.key, label: newLabel };
  void saveVocab({ ...current, [kind]: list });
}

function removeVocabEntry(kind: VocabKind, index: number): void {
  if (!ensureEditOrModal()) return;
  const entry = vocab.value[kind][index];
  if (!entry) return;
  const current = vocab.value;
  const list = current[kind].filter((_, i) => i !== index);
  void saveVocab({ ...current, [kind]: list });
}

function moveVocabEntry(kind: VocabKind, index: number, delta: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const current = vocab.value;
  const list = [...current[kind]];
  const j = index + delta;
  if (j < 0 || j >= list.length) return;
  const a = list[index];
  const b = list[j];
  if (!a || !b) return;
  list[index] = b;
  list[j] = a;
  void saveVocab({ ...current, [kind]: list });
}

const newVocabLabels = ref<Record<VocabKind, string>>({
  audiences: '',
  deadlines: '',
  page_types: '',
});

function commitNewVocab(kind: VocabKind): void {
  const v = newVocabLabels.value[kind];
  if (!v.trim()) return;
  addVocabEntry(kind, v);
  newVocabLabels.value[kind] = '';
}

function vocabPreview(label: string): string {
  return slugify(label) || 'item';
}

// ============= STRUCTURE CMS (Drupal) =============

interface Taxonomy {
  key: string;
  label: string;
  multi?: boolean;
  options: string[];
}
interface DrupalStructure {
  content_types: string[];
  paragraphs: string[];
  paragraph_labels?: Record<string, string>;
  taxonomies: Taxonomy[];
}

const DEFAULT_STRUCTURE: DrupalStructure = {
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
    { key: 'cibles', label: 'Public', multi: true, options: ['Tous publics'] },
    { key: 'mesures', label: 'Politique publique', multi: true, options: [] },
  ],
};

const structure = computed<DrupalStructure>(() => {
  const raw = drupalStore.data as Partial<DrupalStructure> | null;
  if (!raw) return DEFAULT_STRUCTURE;
  return {
    content_types: Array.isArray(raw.content_types)
      ? raw.content_types
      : DEFAULT_STRUCTURE.content_types,
    paragraphs: Array.isArray(raw.paragraphs) ? raw.paragraphs : DEFAULT_STRUCTURE.paragraphs,
    paragraph_labels: raw.paragraph_labels ?? {},
    taxonomies: Array.isArray(raw.taxonomies) ? raw.taxonomies : DEFAULT_STRUCTURE.taxonomies,
  };
});

function cloneStructure(): DrupalStructure {
  return JSON.parse(JSON.stringify(structure.value)) as DrupalStructure;
}

async function commitStructure(next: DrupalStructure): Promise<void> {
  drupalStore.setData(next);
  await drupalStore.save();
}

const newContentType = ref('');
function addContentType(): void {
  if (!ensureEditOrModal()) return;
  const v = newContentType.value.trim();
  if (!v) return;
  const next = cloneStructure();
  next.content_types = [...next.content_types, v];
  newContentType.value = '';
  void commitStructure(next);
}
function renameContentType(i: number, v: string): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  next.content_types[i] = v;
  void commitStructure(next);
}
function removeContentType(i: number): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  next.content_types.splice(i, 1);
  void commitStructure(next);
}

const newParagraph = ref('');
function addParagraph(): void {
  if (!ensureEditOrModal()) return;
  const v = newParagraph.value.trim();
  if (!v) return;
  const next = cloneStructure();
  next.paragraphs = [...next.paragraphs, v];
  newParagraph.value = '';
  void commitStructure(next);
}
function renameParagraph(i: number, v: string): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  next.paragraphs[i] = v;
  void commitStructure(next);
}
function removeParagraph(i: number): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  next.paragraphs.splice(i, 1);
  void commitStructure(next);
}
function setParagraphLabel(key: string, label: string): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  next.paragraph_labels = { ...(next.paragraph_labels ?? {}) };
  if (label.trim()) next.paragraph_labels[key] = label;
  else delete next.paragraph_labels[key];
  void commitStructure(next);
}

function renameTaxonomyLabel(i: number, v: string): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  const t = next.taxonomies[i];
  if (!t) return;
  t.label = v;
  void commitStructure(next);
}
function toggleTaxonomyMulti(i: number): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  const t = next.taxonomies[i];
  if (!t) return;
  t.multi = !t.multi;
  void commitStructure(next);
}
function addTaxonomyOption(i: number, v: string): void {
  if (!ensureEditOrModal()) return;
  const trimmed = v.trim();
  if (!trimmed) return;
  const next = cloneStructure();
  const t = next.taxonomies[i];
  if (!t) return;
  t.options = [...t.options, trimmed];
  void commitStructure(next);
}
function renameTaxonomyOption(ti: number, oi: number, v: string): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  const t = next.taxonomies[ti];
  if (!t) return;
  t.options[oi] = v;
  void commitStructure(next);
}
function removeTaxonomyOption(ti: number, oi: number): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStructure();
  const t = next.taxonomies[ti];
  if (!t) return;
  t.options.splice(oi, 1);
  void commitStructure(next);
}
async function resetStructureToDefault(): Promise<void> {
  if (!ensureEditOrModal()) return;
  const ok = await confirmStore.ask({
    title: 'Réinitialiser la structure CMS ?',
    message:
      'Toutes les options personnalisées (types de contenu, composants, taxonomies) seront remplacées par les valeurs par défaut. Action irréversible.',
    confirmLabel: 'Réinitialiser',
    danger: true,
  });
  if (!ok) return;
  await commitStructure(JSON.parse(JSON.stringify(DEFAULT_STRUCTURE)) as DrupalStructure);
}

const newOption = ref<Record<number, string>>({});
</script>

<template>
  <div>
    <PageHeader
      title="Modèle de données"
      subtitle="Vocabulaires propres au projet (publics, échéances, types de page) et structure du CMS cible (types de contenu, paragraphes, taxonomies). Les clés sont auto-générées du libellé et figées à la création."
    />

    <p v-if="vocabStore.loading || drupalStore.loading">Chargement…</p>

    <p
      v-if="vocabStore.persistTarget === 'local' && vocabStore.localSavedAt"
      class="alert alert-info"
      style="font-size: 0.85rem"
    >
      Modifications locales sauvegardées (bac à sable).
    </p>

    <!-- Onglets internes : Vocabulaires projet | Structure CMS -->
    <nav class="data-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'vocab'"
        class="data-tabs__tab"
        :class="{ 'is-active': activeTab === 'vocab' }"
        @click="activeTab = 'vocab'"
      >
        Vocabulaires projet
        <span class="count-badge count-badge--muted">
          {{ vocab.audiences.length + vocab.deadlines.length + vocab.page_types.length }}
        </span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'cms'"
        class="data-tabs__tab"
        :class="{ 'is-active': activeTab === 'cms' }"
        @click="activeTab = 'cms'"
      >
        Structure CMS
        <span class="count-badge count-badge--muted">
          {{
            structure.content_types.length +
            structure.paragraphs.length +
            structure.taxonomies.length
          }}
        </span>
      </button>
    </nav>

    <!-- ============= ONGLET VOCABULAIRES ============= -->
    <div v-show="activeTab === 'vocab'">
      <details
        v-for="kind in ['audiences', 'deadlines', 'page_types'] as VocabKind[]"
        :key="kind"
        class="vocab-section"
        :open="isOpen(`vocab-${kind}`)"
        @toggle="(e) => onToggle(`vocab-${kind}`, e)"
      >
        <summary class="vocab-section__summary">
          <span class="vocab-section__chevron" aria-hidden="true">▸</span>
          <span class="vocab-section__title">
            {{ KIND_LABELS[kind].title }}
            <span class="count-badge count-badge--muted">{{ vocab[kind].length }}</span>
          </span>
          <span class="vocab-section__subtitle">{{ KIND_LABELS[kind].subtitle }}</span>
        </summary>

        <div class="vocab-section__body">
          <ul class="vocab-list">
            <li v-for="(e, i) in vocab[kind]" :key="e.key" class="vocab-item">
              <div v-if="canEdit" class="vocab-item__actions">
                <button
                  class="fr-btn fr-btn--tertiary fr-btn--sm"
                  title="Monter"
                  :disabled="i === 0"
                  @click="moveVocabEntry(kind, i, -1)"
                >
                  ↑
                </button>
                <button
                  class="fr-btn fr-btn--tertiary fr-btn--sm"
                  title="Descendre"
                  :disabled="i === vocab[kind].length - 1"
                  @click="moveVocabEntry(kind, i, 1)"
                >
                  ↓
                </button>
                <button
                  class="fr-btn fr-btn--tertiary fr-btn--sm vocab-item__delete"
                  title="Supprimer"
                  @click="removeVocabEntry(kind, i)"
                >
                  ×
                </button>
              </div>
              <div v-else class="vocab-item__actions vocab-item__actions--placeholder"></div>
              <input
                type="text"
                :value="e.label"
                class="fr-input fr-input--sm vocab-item__label"
                :disabled="!canEdit"
                :aria-label="`Libellé du ${KIND_LABELS[kind].itemSingular}`"
                @change="(ev) => renameVocabEntry(kind, i, (ev.target as HTMLInputElement).value)"
              />
              <code class="vocab-item__key" :title="`Clé immuable : ${e.key}`">{{ e.key }}</code>
            </li>
          </ul>

          <div v-if="canEdit" class="vocab-add">
            <button
              type="button"
              class="fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left vocab-add__btn"
              :disabled="!newVocabLabels[kind].trim()"
              @click="commitNewVocab(kind)"
            >
              Ajouter
            </button>
            <input
              v-model="newVocabLabels[kind]"
              type="text"
              :placeholder="KIND_LABELS[kind].placeholder"
              class="fr-input fr-input--sm vocab-item__label"
              :aria-label="`Nouveau ${KIND_LABELS[kind].itemSingular}`"
              @keydown.enter.prevent="commitNewVocab(kind)"
            />
            <code class="vocab-item__key vocab-item__key--preview">
              {{ vocabPreview(newVocabLabels[kind]) }}
            </code>
          </div>
        </div>
      </details>
    </div>

    <!-- ============= ONGLET STRUCTURE CMS ============= -->
    <div v-show="activeTab === 'cms'">
      <div class="toolbar">
        <span style="color: #666; font-size: 0.9rem">
          💡 Ces valeurs alimentent les sélecteurs de la
          <RouterLink :to="{ name: 'project-maquette', params: { slug } }">Maquette</RouterLink>
          (type de contenu, type éditorial, public, politique publique).
        </span>
        <span class="spacer"></span>
        <button
          v-if="canEdit"
          class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-refresh-line fr-btn--icon-left"
          @click="resetStructureToDefault"
        >
          Réinitialiser
        </button>
      </div>

      <details
        class="vocab-section"
        :open="isOpen('cms-content_types')"
        @toggle="(e) => onToggle('cms-content_types', e)"
      >
        <summary class="vocab-section__summary">
          <span class="vocab-section__chevron" aria-hidden="true">▸</span>
          <span class="vocab-section__title">
            Types de contenu
            <span class="count-badge count-badge--muted">{{ structure.content_types.length }}</span>
          </span>
          <span class="vocab-section__subtitle"> Types de pages exposés dans le CMS. </span>
        </summary>
        <div class="vocab-section__body">
          <ul class="vocab-list">
            <li
              v-for="(ct, i) in structure.content_types"
              :key="`ct-${i}`"
              class="vocab-item vocab-item--no-key"
            >
              <div v-if="canEdit" class="vocab-item__actions">
                <button
                  class="fr-btn fr-btn--tertiary fr-btn--sm vocab-item__delete"
                  title="Supprimer"
                  @click="removeContentType(i)"
                >
                  ×
                </button>
              </div>
              <div v-else class="vocab-item__actions vocab-item__actions--placeholder"></div>
              <input
                type="text"
                :value="ct"
                class="fr-input fr-input--sm vocab-item__label"
                :disabled="!canEdit"
                @change="(e) => renameContentType(i, (e.target as HTMLInputElement).value)"
              />
            </li>
          </ul>
          <div v-if="canEdit" class="vocab-add vocab-add--no-key">
            <button
              class="fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left vocab-add__btn"
              :disabled="!newContentType.trim()"
              @click="addContentType"
            >
              Ajouter
            </button>
            <input
              v-model="newContentType"
              type="text"
              placeholder="Nouveau type de contenu…"
              class="fr-input fr-input--sm vocab-item__label"
              @keydown.enter.prevent="addContentType"
            />
          </div>
        </div>
      </details>

      <details
        class="vocab-section"
        :open="isOpen('cms-paragraphs')"
        @toggle="(e) => onToggle('cms-paragraphs', e)"
      >
        <summary class="vocab-section__summary">
          <span class="vocab-section__chevron" aria-hidden="true">▸</span>
          <span class="vocab-section__title">
            Composants
            <span class="count-badge count-badge--muted">{{ structure.paragraphs.length }}</span>
          </span>
          <span class="vocab-section__subtitle">
            Types de composants mobilisables dans la maquette. La liste sert d'allow-list ; un
            composant non listé ici sera caché dans l'éditeur.
          </span>
        </summary>
        <div class="vocab-section__body">
          <ul class="vocab-list">
            <li v-for="(p, i) in structure.paragraphs" :key="`p-${i}`" class="paragraph-item">
              <div v-if="canEdit" class="vocab-item__actions">
                <button
                  class="fr-btn fr-btn--tertiary fr-btn--sm vocab-item__delete"
                  title="Supprimer"
                  @click="removeParagraph(i)"
                >
                  ×
                </button>
              </div>
              <div v-else class="vocab-item__actions vocab-item__actions--placeholder"></div>
              <input
                type="text"
                :value="p"
                class="fr-input fr-input--sm paragraph-item__key"
                :disabled="!canEdit"
                :aria-label="`Clé du composant ${p}`"
                @change="(e) => renameParagraph(i, (e.target as HTMLInputElement).value)"
              />
              <input
                type="text"
                :value="structure.paragraph_labels?.[p] ?? ''"
                class="fr-input fr-input--sm paragraph-item__label"
                :placeholder="`Libellé affiché (optionnel)`"
                :disabled="!canEdit"
                :aria-label="`Libellé affiché pour ${p}`"
                @change="(e) => setParagraphLabel(p, (e.target as HTMLInputElement).value)"
              />
            </li>
          </ul>
          <div v-if="canEdit" class="vocab-add vocab-add--no-key">
            <button
              class="fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left vocab-add__btn"
              :disabled="!newParagraph.trim()"
              @click="addParagraph"
            >
              Ajouter
            </button>
            <input
              v-model="newParagraph"
              type="text"
              placeholder="Nouvelle clé composant (ex. card-grid)…"
              class="fr-input fr-input--sm vocab-item__label"
              @keydown.enter.prevent="addParagraph"
            />
          </div>
        </div>
      </details>

      <details
        class="vocab-section"
        :open="isOpen('cms-taxonomies')"
        @toggle="(e) => onToggle('cms-taxonomies', e)"
      >
        <summary class="vocab-section__summary">
          <span class="vocab-section__chevron" aria-hidden="true">▸</span>
          <span class="vocab-section__title">
            Taxonomies
            <span class="count-badge count-badge--muted">{{ structure.taxonomies.length }}</span>
          </span>
          <span class="vocab-section__subtitle">
            Vocabulaires classant chaque page. Cochez « multi » pour permettre plusieurs valeurs.
          </span>
        </summary>
        <div class="vocab-section__body">
          <div v-for="(t, ti) in structure.taxonomies" :key="`tx-${ti}`" class="taxonomy-block">
            <div class="taxonomy-block__head">
              <label class="taxonomy-multi">
                <input
                  type="checkbox"
                  :checked="!!t.multi"
                  :disabled="!canEdit"
                  @change="toggleTaxonomyMulti(ti)"
                />
                Multi
              </label>
              <input
                type="text"
                :value="t.label"
                class="fr-input fr-input--sm vocab-item__label"
                :disabled="!canEdit"
                @change="(e) => renameTaxonomyLabel(ti, (e.target as HTMLInputElement).value)"
              />
              <code class="vocab-item__key">{{ t.key }}</code>
            </div>
            <ul class="vocab-list taxonomy-options">
              <li
                v-for="(o, oi) in t.options"
                :key="`opt-${oi}`"
                class="vocab-item vocab-item--no-key"
              >
                <div v-if="canEdit" class="vocab-item__actions">
                  <button
                    class="fr-btn fr-btn--tertiary fr-btn--sm vocab-item__delete"
                    title="Supprimer"
                    @click="removeTaxonomyOption(ti, oi)"
                  >
                    ×
                  </button>
                </div>
                <div v-else class="vocab-item__actions vocab-item__actions--placeholder"></div>
                <input
                  type="text"
                  :value="o"
                  class="fr-input fr-input--sm vocab-item__label"
                  :disabled="!canEdit"
                  @change="
                    (e) => renameTaxonomyOption(ti, oi, (e.target as HTMLInputElement).value)
                  "
                />
              </li>
            </ul>
            <div v-if="canEdit" class="vocab-add vocab-add--no-key">
              <button
                class="fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left vocab-add__btn"
                :disabled="!(newOption[ti] ?? '').trim()"
                @click="
                  () => {
                    addTaxonomyOption(ti, newOption[ti] ?? '');
                    newOption[ti] = '';
                  }
                "
              >
                Ajouter
              </button>
              <input
                v-model="newOption[ti]"
                type="text"
                placeholder="Nouvelle option…"
                class="fr-input fr-input--sm vocab-item__label"
                @keydown.enter.prevent="
                  () => {
                    addTaxonomyOption(ti, newOption[ti] ?? '');
                    newOption[ti] = '';
                  }
                "
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
/* === Onglets internes Vocabulaires / Structure CMS === */
.data-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-default-grey, #ddd);
  margin: 0 0 1.25rem;
}
.data-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  font: inherit;
  font-weight: 500;
  padding: 0.7rem 1.1rem;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  color: var(--text-mention-grey, #555);
}
.data-tabs__tab:hover {
  color: var(--text-default-grey, #161616);
}
.data-tabs__tab.is-active {
  color: var(--text-action-high-blue-france, #000091);
  border-bottom-color: currentColor;
  font-weight: 600;
}

/* === Sections accordéon (chaque vocab / catégorie CMS) === */
.vocab-section {
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  margin-bottom: 0.6rem;
}
.vocab-section[open] {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
}
.vocab-section__summary {
  list-style: none;
  cursor: pointer;
  padding: 0.9rem 1.25rem;
  display: grid;
  grid-template-columns: 1rem auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: baseline;
}
.vocab-section__summary::-webkit-details-marker {
  display: none;
}
.vocab-section__chevron {
  color: var(--text-mention-grey, #888);
  font-size: 0.8rem;
  transition: transform 0.15s;
  align-self: center;
}
.vocab-section[open] .vocab-section__chevron {
  transform: rotate(90deg);
}
.vocab-section__title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-title-grey, #161616);
  white-space: nowrap;
}
.vocab-section__subtitle {
  font-size: 0.85rem;
  color: var(--text-mention-grey, #666);
  font-weight: 400;
}
.vocab-section__body {
  padding: 0 1.25rem 1.25rem;
  border-top: 1px solid var(--border-default-grey, #eee);
  padding-top: 0.75rem;
}

/* === Grille vocab : [actions auto] [input flex] [key auto] ===
 * Largeurs des colonnes auto stables → alignement vertical cohérent
 * entre toutes les rows (les boutons à gauche sont parfaitement empilés,
 * la key à droite aussi). */
.vocab-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.vocab-item {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr) 10rem;
  gap: 0.75rem;
  align-items: center;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border-default-grey, #f0f0f0);
}
.vocab-item:last-child {
  border-bottom: none;
}
.vocab-item--no-key {
  grid-template-columns: 7.5rem minmax(0, 1fr);
}

/* Composants : [actions auto] [key 200px] [label flex] */
.paragraph-item {
  display: grid;
  grid-template-columns: 7.5rem 200px minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border-default-grey, #f0f0f0);
}
.paragraph-item__key {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
.paragraph-item:last-child {
  border-bottom: none;
}

.vocab-item__actions {
  display: flex;
  gap: 0.2rem;
}
.vocab-item__actions--placeholder {
  visibility: hidden;
}
.vocab-item__label,
.paragraph-item__label {
  min-width: 0;
}
.vocab-item__key {
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: var(--text-mention-grey, #888);
  background: #f1f1f1;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  justify-self: end;
}
.vocab-item__key--preview {
  opacity: 0.6;
  font-style: italic;
}
.vocab-item__delete:hover {
  color: var(--text-default-error, #ce0500);
}

/* === Ligne d'ajout : même grille pour alignement === */
.vocab-add {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr) 10rem;
  gap: 0.75rem;
  align-items: center;
  padding-top: 0.75rem;
  margin-top: 0.25rem;
  border-top: 1px dashed var(--border-default-grey, #ddd);
}
.vocab-add--no-key {
  grid-template-columns: 7.5rem minmax(0, 1fr);
}
.vocab-add__btn {
  justify-self: start;
  white-space: nowrap;
}

/* === Taxonomies (Structure CMS) === */
.taxonomy-block {
  border-top: 1px solid var(--border-default-grey, #eaeaea);
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}
.taxonomy-block:first-of-type {
  border-top: none;
  padding-top: 0;
  margin-top: 0;
}
.taxonomy-block__head {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.5rem;
}
.taxonomy-multi {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-mention-grey, #666);
  white-space: nowrap;
}
.taxonomy-options {
  padding-left: 1.5rem;
}

.spacer {
  flex: 1;
}

@media (max-width: 700px) {
  .vocab-item,
  .vocab-item--no-key,
  .vocab-add,
  .vocab-add--no-key,
  .paragraph-item,
  .taxonomy-block__head {
    grid-template-columns: 1fr;
    gap: 0.3rem;
  }
  .vocab-item__key {
    justify-self: start;
  }
}
</style>
