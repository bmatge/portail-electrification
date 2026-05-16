<script setup lang="ts">
// Page "Ressources & services existants" (legacy `dispositifs.html`)
// — master-détail : liste à gauche, panneau détail à droite. Toolbar 4
// boutons (+ Nouveau / Export / Import / Réinitialiser), 3 filtres
// (Search / Catégorie / Audience).

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDispositifsStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { useConfirm } from '../stores/confirm.js';
import { useCanEdit } from '../composables/useCanEdit.js';
import PageHeader from '../components/ui/PageHeader.vue';
import InlineEdit from '../components/ui/InlineEdit.vue';

interface Dispositif {
  id: string;
  category?: string;
  audience?: string;
  name: string;
  url?: string;
  tel?: string;
  description?: string;
  porteur?: string;
  tutelle?: string;
  type?: string;
  reutilisable?: string;
  maturite?: string;
  commentaire?: string;
  [k: string]: unknown;
}
interface DispositifsMeta {
  title?: string;
  context?: string;
  categories?: string[];
  [k: string]: unknown;
}
interface DispositifsData {
  meta?: DispositifsMeta;
  dispositifs: Dispositif[];
}

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const store = useDispositifsStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();
const confirmStore = useConfirm();

onMounted(() => slug.value && store.hydrate(slug.value));
watch(slug, (s) => s && store.hydrate(s));

const canEdit = useCanEdit('data:write', () => slug.value);

const data = computed<DispositifsData>(() => {
  const raw = store.data as DispositifsData | null;
  if (raw && Array.isArray(raw.dispositifs)) return raw;
  return { dispositifs: [] };
});

const search = ref('');
const filterCategory = ref('');
const filterAudience = ref('');
const selectedId = ref<string | null>(null);

const categories = computed(() => {
  const set = new Set<string>();
  for (const d of data.value.dispositifs) if (d.category) set.add(d.category);
  for (const c of data.value.meta?.categories ?? []) set.add(c);
  return Array.from(set).sort();
});

const audiences = computed(() => {
  const set = new Set<string>();
  for (const d of data.value.dispositifs) if (d.audience) set.add(d.audience);
  return Array.from(set).sort();
});

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return data.value.dispositifs.filter((d) => {
    if (term) {
      const hay = [d.name, d.description, d.category, d.porteur, d.id].join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (filterCategory.value && d.category !== filterCategory.value) return false;
    if (filterAudience.value && d.audience !== filterAudience.value) return false;
    return true;
  });
});

const selected = computed<Dispositif | null>(
  () => data.value.dispositifs.find((d) => d.id === selectedId.value) ?? null,
);

function ensureEdit(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

function clone(): DispositifsData {
  return JSON.parse(JSON.stringify(data.value)) as DispositifsData;
}

async function commit(next: DispositifsData): Promise<void> {
  store.setData(next);
  await store.save();
}

function newDispositifId(): string {
  return 'D-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function addDispositif(): void {
  if (!ensureEdit()) return;
  const next = clone();
  const id = newDispositifId();
  next.dispositifs.unshift({
    id,
    name: 'Nouveau dispositif',
    category: '',
    audience: '',
    description: '',
    url: '',
    porteur: '',
  });
  selectedId.value = id;
  void commit(next);
}

function updateField<K extends keyof Dispositif>(id: string, field: K, value: string): void {
  if (!ensureEdit()) return;
  const next = clone();
  const d = next.dispositifs.find((x) => x.id === id);
  if (!d) return;
  (d as Record<string, unknown>)[field as string] = value;
  void commit(next);
}

async function removeDispositif(id: string): Promise<void> {
  if (!ensureEdit()) return;
  const d = data.value.dispositifs.find((x) => x.id === id);
  if (!d) return;
  const ok = await confirmStore.ask({
    title: `Supprimer la ressource « ${d.name} » ?`,
    message:
      'La ressource sera retirée du catalogue. Les nœuds qui la référençaient resteront mais perdront la liaison.',
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!ok) return;
  const next = clone();
  next.dispositifs = next.dispositifs.filter((x) => x.id !== id);
  if (selectedId.value === id) selectedId.value = null;
  void commit(next);
}

async function exportJson(): Promise<void> {
  const blob = new Blob([JSON.stringify(data.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dispositifs-${slug.value}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJson(event: Event): Promise<void> {
  if (!ensureEdit()) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as DispositifsData;
    if (!Array.isArray(parsed.dispositifs)) {
      alert('Format invalide : attendu { dispositifs: [...] }');
      return;
    }
    const ok = await confirmStore.ask({
      title: `Importer ${parsed.dispositifs.length} ressources ?`,
      message: 'Le contenu actuel du catalogue sera remplacé.',
      confirmLabel: 'Remplacer',
      danger: true,
    });
    if (!ok) return;
    await commit(parsed);
    input.value = '';
  } catch (e) {
    alert(`Erreur d'import : ${(e as Error).message}`);
  }
}

async function resetToDefault(): Promise<void> {
  if (!ensureEdit()) return;
  const ok = await confirmStore.ask({
    title: 'Vider toutes les ressources ?',
    message: 'Toutes les ressources du catalogue seront supprimées. Action irréversible.',
    confirmLabel: 'Tout vider',
    danger: true,
  });
  if (!ok) return;
  await commit({ dispositifs: [] });
  selectedId.value = null;
}

// Mapping (audience libre → classe colorée fr-tag.tag-audience-*).
// Si l'audience ne matche pas un public connu, fallback générique.
function audienceClass(label: string | undefined): string {
  if (!label) return '';
  const norm = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (norm.includes('particulier')) return 'tag-audience-particuliers';
  if (norm.includes('copropr')) return 'tag-audience-coproprietes';
  if (norm.includes('collectivit')) return 'tag-audience-collectivites';
  if (norm.includes('pro')) return 'tag-audience-pros';
  if (norm.includes('industri')) return 'tag-audience-industriels';
  if (norm.includes('agricult')) return 'tag-audience-agriculteurs';
  if (norm.includes('partenair')) return 'tag-audience-partenaires';
  if (norm.includes('agent')) return 'tag-audience-agents';
  if (norm.includes('outre')) return 'tag-audience-outremer';
  return '';
}
</script>

<template>
  <div>
    <PageHeader
      title="Ressources & services existants"
      subtitle="Cartographie des dispositifs étatiques susceptibles d'être pointés ou intégrés par le projet. Permet de rattacher chaque nœud du site à des services tiers (France Rénov', Mes Aides Réno…)."
    />

    <div class="toolbar">
      <button class="fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left" @click="addDispositif">
        Nouveau dispositif
      </button>
      <button
        class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-download-line fr-btn--icon-left"
        @click="exportJson"
      >
        Export
      </button>
      <label class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-upload-line fr-btn--icon-left">
        Import
        <input type="file" accept="application/json" style="display: none" @change="importJson" />
      </label>
      <button
        class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-refresh-line fr-btn--icon-left"
        @click="resetToDefault"
      >
        Réinitialiser
      </button>
      <span class="spacer"></span>
      <span style="font-size: 0.85rem; color: #555">
        {{ filtered.length }} / {{ data.dispositifs.length }} dispositif{{
          data.dispositifs.length > 1 ? 's' : ''
        }}
      </span>
    </div>

    <div class="fr-grid-row fr-grid-row--gutters" style="margin-bottom: 1rem">
      <div class="fr-col-12 fr-col-md-6">
        <label class="fr-label" for="disp-search">Rechercher (nom, description, porteur…)</label>
        <input
          id="disp-search"
          v-model="search"
          type="search"
          placeholder="ex. France Rénov', ANAH…"
          class="fr-input"
        />
      </div>
      <div class="fr-col-6 fr-col-md-3">
        <label class="fr-label" for="disp-cat">Catégorie</label>
        <select id="disp-cat" v-model="filterCategory" class="fr-select">
          <option value="">Toutes catégories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="fr-col-6 fr-col-md-3">
        <label class="fr-label" for="disp-aud">Public</label>
        <select id="disp-aud" v-model="filterAudience" class="fr-select">
          <option value="">Tous publics</option>
          <option v-for="a in audiences" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
    </div>

    <p v-if="data.dispositifs.length === 0" class="alert alert-info">
      Aucun dispositif pour ce projet. Cliquez sur <strong>+ Nouveau dispositif</strong> pour
      démarrer le catalogue.
    </p>

    <div v-else class="master-detail">
      <!-- Liste -->
      <div class="dispositif-master">
        <ul class="dispositif-list">
          <li
            v-for="d in filtered"
            :key="d.id"
            :class="['dispositif-item', { 'is-selected': d.id === selectedId }]"
            @click="selectedId = d.id"
          >
            <div class="dispositif-item__body">
              <div class="dispositif-item__head">
                <span class="dispositif-item__name">{{ d.name }}</span>
              </div>
              <div class="dispositif-item__tags">
                <p v-if="d.category" class="fr-tag fr-tag--sm">{{ d.category }}</p>
                <p v-if="d.audience" class="fr-tag fr-tag--sm" :class="audienceClass(d.audience)">
                  {{ d.audience }}
                </p>
                <p v-if="d.type" class="fr-tag fr-tag--sm">{{ d.type }}</p>
              </div>
              <p v-if="d.porteur" class="dispositif-item__porteur">
                <span style="color: #888">Porteur :</span> {{ d.porteur }}
              </p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Détail -->
      <div class="dispositif-detail master-detail__sticky">
        <div v-if="!selected" class="dispositif-detail__empty">
          <p style="margin: 0; color: #888">
            Sélectionnez un dispositif dans la liste pour voir son détail.
          </p>
        </div>
        <div v-else class="panel-card">
          <header class="dispositif-detail__head">
            <InlineEdit
              :value="selected.name"
              :can-edit="canEdit"
              placeholder="Nom du dispositif…"
              display-class="dispositif-detail__name"
              @update="(v: string) => updateField(selected!.id, 'name', v)"
              @edit-attempt="ensureEdit"
            />
            <button
              v-if="canEdit"
              class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-delete-line fr-btn--icon-left"
              style="color: #ce0500"
              @click="removeDispositif(selected.id)"
            >
              Supprimer
            </button>
          </header>

          <!-- Section Identification -->
          <section class="dispositif-detail__section">
            <h3 class="dispositif-detail__section-title">Identification</h3>
            <dl class="dispositif-detail__grid">
              <div class="kv">
                <dt>Catégorie</dt>
                <dd>
                  <InlineEdit
                    :value="selected.category ?? ''"
                    :can-edit="canEdit"
                    placeholder="—"
                    @update="(v: string) => updateField(selected!.id, 'category', v)"
                    @edit-attempt="ensureEdit"
                  />
                </dd>
              </div>
              <div class="kv">
                <dt>Public</dt>
                <dd>
                  <InlineEdit
                    :value="selected.audience ?? ''"
                    :can-edit="canEdit"
                    placeholder="—"
                    @update="(v: string) => updateField(selected!.id, 'audience', v)"
                    @edit-attempt="ensureEdit"
                  />
                </dd>
              </div>
              <div class="kv">
                <dt>Porteur</dt>
                <dd>
                  <InlineEdit
                    :value="selected.porteur ?? ''"
                    :can-edit="canEdit"
                    placeholder="—"
                    @update="(v: string) => updateField(selected!.id, 'porteur', v)"
                    @edit-attempt="ensureEdit"
                  />
                </dd>
              </div>
              <div class="kv">
                <dt>Tutelle</dt>
                <dd>
                  <InlineEdit
                    :value="selected.tutelle ?? ''"
                    :can-edit="canEdit"
                    placeholder="—"
                    @update="(v: string) => updateField(selected!.id, 'tutelle', v)"
                    @edit-attempt="ensureEdit"
                  />
                </dd>
              </div>
            </dl>
          </section>

          <!-- Section Caractéristiques -->
          <section class="dispositif-detail__section">
            <h3 class="dispositif-detail__section-title">Caractéristiques</h3>
            <dl class="dispositif-detail__grid">
              <div class="kv">
                <dt>Type</dt>
                <dd>
                  <InlineEdit
                    :value="selected.type ?? ''"
                    :can-edit="canEdit"
                    placeholder="Portail / Simulateur / Carte / …"
                    @update="(v: string) => updateField(selected!.id, 'type', v)"
                    @edit-attempt="ensureEdit"
                  />
                </dd>
              </div>
              <div class="kv">
                <dt>Maturité</dt>
                <dd>
                  <InlineEdit
                    :value="selected.maturite ?? ''"
                    :can-edit="canEdit"
                    placeholder="Mature / Beta / Pilote / …"
                    @update="(v: string) => updateField(selected!.id, 'maturite', v)"
                    @edit-attempt="ensureEdit"
                  />
                </dd>
              </div>
            </dl>
          </section>

          <!-- Section Contact -->
          <section class="dispositif-detail__section">
            <h3 class="dispositif-detail__section-title">Contact</h3>
            <div class="kv">
              <dt>URL</dt>
              <dd>
                <a
                  v-if="selected.url && !canEdit"
                  :href="selected.url"
                  target="_blank"
                  rel="noopener"
                  class="dispositif-detail__url"
                >
                  {{ selected.url }} ↗
                </a>
                <InlineEdit
                  v-else
                  :value="selected.url ?? ''"
                  :can-edit="canEdit"
                  placeholder="https://…"
                  @update="(v: string) => updateField(selected!.id, 'url', v)"
                  @edit-attempt="ensureEdit"
                />
              </dd>
            </div>
            <div class="kv">
              <dt>Téléphone</dt>
              <dd>
                <InlineEdit
                  :value="selected.tel ?? ''"
                  :can-edit="canEdit"
                  placeholder="—"
                  @update="(v: string) => updateField(selected!.id, 'tel', v)"
                  @edit-attempt="ensureEdit"
                />
              </dd>
            </div>
          </section>

          <!-- Section Description -->
          <section class="dispositif-detail__section">
            <h3 class="dispositif-detail__section-title">Description</h3>
            <InlineEdit
              :value="selected.description ?? ''"
              textarea
              :rows="4"
              :can-edit="canEdit"
              placeholder="Décrire le dispositif…"
              @update="(v: string) => updateField(selected!.id, 'description', v)"
              @edit-attempt="ensureEdit"
            />
          </section>

          <!-- Section Notes / Réutilisabilité -->
          <section class="dispositif-detail__section">
            <h3 class="dispositif-detail__section-title">Réutilisabilité &amp; notes</h3>
            <div class="kv kv--stacked">
              <dt>Réutilisable</dt>
              <dd>
                <InlineEdit
                  :value="selected.reutilisable ?? ''"
                  textarea
                  :rows="2"
                  :can-edit="canEdit"
                  placeholder="Oui / Non + modalités…"
                  @update="(v: string) => updateField(selected!.id, 'reutilisable', v)"
                  @edit-attempt="ensureEdit"
                />
              </dd>
            </div>
            <div class="kv kv--stacked">
              <dt>Commentaire interne</dt>
              <dd>
                <InlineEdit
                  :value="selected.commentaire ?? ''"
                  textarea
                  :rows="2"
                  :can-edit="canEdit"
                  placeholder="Notes…"
                  @update="(v: string) => updateField(selected!.id, 'commentaire', v)"
                  @edit-attempt="ensureEdit"
                />
              </dd>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spacer {
  flex: 1;
}

/* ===== Liste ===== */
.dispositif-master {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: calc(100vh - 18rem);
  overflow-y: auto;
  padding-right: 0.25rem;
}
.dispositif-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.dispositif-item {
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 6px;
  cursor: pointer;
  background: white;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    background 0.15s;
}
.dispositif-item:hover {
  background: var(--background-alt-blue-france, #f7f7ff);
  border-color: var(--border-action-high-blue-france, #6a6af4);
}
.dispositif-item.is-selected {
  border-color: var(--text-action-high-blue-france, #000091);
  background: var(--background-contrast-info, #eef0ff);
  box-shadow: 0 0 0 2px var(--text-action-high-blue-france, #000091) inset;
}
.dispositif-item__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.dispositif-item__head {
  min-width: 0;
}
.dispositif-item__name {
  font-weight: 600;
  color: var(--text-action-high-blue-france, #000091);
  font-size: 0.98rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dispositif-item__tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.dispositif-item__porteur {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-default-grey, #444);
}

/* ===== Détail ===== */
.dispositif-detail__empty {
  background: white;
  border: 1px dashed var(--border-default-grey, #ddd);
  border-radius: 6px;
  padding: 2rem 1rem;
  text-align: center;
}
.dispositif-detail__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-bottom: 1px solid var(--border-default-grey, #eee);
  padding-bottom: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.dispositif-detail :deep(.dispositif-detail__name) {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 700;
  min-width: 200px;
}
.dispositif-detail__section {
  margin-bottom: 1.25rem;
}
.dispositif-detail__section-title {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-mention-grey, #666);
  font-weight: 700;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--border-default-grey, #eee);
}
.dispositif-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
  margin: 0;
}
.kv {
  margin: 0;
}
.kv dt {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-mention-grey, #666);
  margin-bottom: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.kv dd {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-default-grey, #161616);
}
.kv--stacked {
  margin-bottom: 0.6rem;
}
.dispositif-detail__url {
  color: var(--text-action-high-blue-france, #000091);
  text-decoration: underline;
  word-break: break-all;
}

@media (max-width: 900px) {
  .dispositif-master {
    max-height: none;
  }
  .dispositif-detail__grid {
    grid-template-columns: 1fr;
  }
}
</style>
