<script setup lang="ts">
// `<ParagraphLive>` — preview DSFR rendue avec champs édités INLINE
// directement dans le rendu. Quand l'utilisateur clique sur le titre d'une
// carte, c'est ce titre qui devient input — pas un éditeur dans un panneau
// séparé. Reproduit l'expérience v1 (assets/maquette.js).
//
// Mini toolbar visible au hover : drag-handle (futur), edit-defaults, ↑↓, ×.
//
// Couvre les 17 PARAGRAPH_SCHEMAS via 3 patterns (text / simple / items).

import { computed, ref } from 'vue';
import { PARAGRAPH_SCHEMAS, PARAGRAPH_LABELS, defaultsFor } from '@latelier/shared';
import InlineEdit from '../ui/InlineEdit.vue';

const props = defineProps<{
  code: string;
  data: unknown;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'update', data: unknown): void;
  (e: 'remove'): void;
  (e: 'move', dir: -1 | 1): void;
  (e: 'edit-attempt'): void;
}>();

const schema = computed(() => PARAGRAPH_SCHEMAS[props.code] ?? null);
const label = computed(() => PARAGRAPH_LABELS[props.code] ?? props.code);

const hover = ref(false);
const activeTab = ref(0);

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

const asString = computed(() => (typeof props.data === 'string' ? props.data : ''));
const asObject = computed(
  () =>
    (props.data && typeof props.data === 'object' && !Array.isArray(props.data)
      ? (props.data as Record<string, unknown>)
      : {}) as Record<string, unknown>,
);
const asArray = computed(() =>
  Array.isArray(props.data) ? (props.data as Record<string, unknown>[]) : [],
);

function ensureEdit(): boolean {
  if (props.canEdit) return true;
  emit('edit-attempt');
  return false;
}

function updateText(value: string): void {
  if (!ensureEdit()) return;
  emit('update', value);
}

function updateSimpleField(key: string, value: string): void {
  if (!ensureEdit()) return;
  const cur = { ...asObject.value };
  cur[key] = value;
  emit('update', cur);
}

function updateItemField(index: number, key: string, value: string): void {
  if (!ensureEdit()) return;
  const arr = asArray.value.slice();
  const item = { ...(arr[index] ?? {}) };
  item[key] = value;
  arr[index] = item;
  emit('update', arr);
}

function addItem(): void {
  if (!ensureEdit()) return;
  const s = schema.value;
  if (!s || s.kind !== 'items') return;
  const arr = asArray.value.slice();
  const blank: Record<string, string> = {};
  for (const f of s.fields ?? []) blank[f.key] = '';
  arr.push(blank);
  emit('update', arr);
}

function removeItem(index: number): void {
  if (!ensureEdit()) return;
  if (!confirm('Supprimer cet élément ?')) return;
  const arr = asArray.value.slice();
  arr.splice(index, 1);
  emit('update', arr);
}

function moveItem(index: number, dir: -1 | 1): void {
  if (!ensureEdit()) return;
  const arr = asArray.value.slice();
  const j = index + dir;
  if (j < 0 || j >= arr.length) return;
  const a = arr[index];
  const b = arr[j];
  if (!a || !b) return;
  arr[index] = b;
  arr[j] = a;
  emit('update', arr);
}

function resetDefaults(): void {
  if (!ensureEdit()) return;
  emit('update', defaultsFor(props.code));
}
</script>

<template>
  <div
    class="pl"
    :class="{ 'pl--hover': hover }"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- Toolbar mini : visible au hover -->
    <div class="pl__toolbar">
      <span class="pl__label">¶ {{ label.toUpperCase() }}</span>
      <span style="flex: 1"></span>
      <button
        v-if="canEdit"
        class="pl__btn"
        type="button"
        :title="`Réinitialiser ce ${label}`"
        @click="resetDefaults"
      >
        ↺
      </button>
      <button class="pl__btn" type="button" title="Monter" @click="emit('move', -1)">↑</button>
      <button class="pl__btn" type="button" title="Descendre" @click="emit('move', 1)">↓</button>
      <button
        class="pl__btn pl__btn--danger"
        type="button"
        title="Supprimer"
        @click="emit('remove')"
      >
        ×
      </button>
    </div>

    <!-- Rendu DSFR avec édition inline -->
    <div class="pl__content">
      <template v-if="schema?.kind === 'text'">
        <div v-if="props.code === 'highlight'" class="fr-highlight">
          <InlineEdit
            :value="asString"
            :textarea="!!schema.textarea"
            :rows="3"
            :can-edit="canEdit"
            :placeholder="String(schema.defaults ?? 'Cliquer pour rédiger…')"
            @update="updateText"
            @edit-attempt="emit('edit-attempt')"
          />
        </div>
        <figure v-else-if="props.code === 'quote'" class="fr-quote">
          <blockquote>
            «
            <InlineEdit
              :value="asString"
              textarea
              :rows="2"
              :can-edit="canEdit"
              :placeholder="String(schema.defaults ?? 'Cliquer pour rédiger une citation…')"
              @update="updateText"
              @edit-attempt="emit('edit-attempt')"
            />
            »
          </blockquote>
        </figure>
        <pre v-else-if="props.code === 'code'" class="preview-code"><InlineEdit
            :value="asString"
            textarea
            :rows="4"
            :can-edit="canEdit"
            :placeholder="String(schema.defaults ?? 'Cliquer pour coller du code…')"
            @update="updateText"
            @edit-attempt="emit('edit-attempt')"
          /></pre>
        <div v-else class="pl__plain-text">
          <small style="color: #888">[{{ label }}]</small>
          <InlineEdit
            :value="asString"
            :textarea="!!schema.textarea"
            :rows="2"
            :can-edit="canEdit"
            :placeholder="String(schema.defaults ?? 'Cliquer pour saisir…')"
            @update="updateText"
            @edit-attempt="emit('edit-attempt')"
          />
        </div>
      </template>

      <template v-else-if="schema?.kind === 'simple'">
        <!-- callout -->
        <div v-if="props.code === 'callout'" class="fr-callout">
          <h3 class="fr-callout__title">
            <InlineEdit
              :value="asStr(asObject.title)"
              :can-edit="canEdit"
              placeholder="Titre…"
              @update="(v) => updateSimpleField('title', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </h3>
          <p class="fr-callout__text">
            <InlineEdit
              :value="asStr(asObject.text)"
              textarea
              :rows="2"
              :can-edit="canEdit"
              placeholder="Texte…"
              @update="(v) => updateSimpleField('text', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </p>
        </div>

        <!-- button -->
        <div v-else-if="props.code === 'button'" class="pl-button-wrap">
          <span class="fr-btn" style="pointer-events: none">
            <InlineEdit
              :value="asStr(asObject.label)"
              :can-edit="canEdit"
              placeholder="Libellé bouton…"
              display-class="pl-btn-label"
              @update="(v) => updateSimpleField('label', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </span>
          <small style="color: #555; margin-left: 0.5rem"
            >→
            <InlineEdit
              :value="asStr(asObject.url)"
              :can-edit="canEdit"
              placeholder="URL…"
              @update="(v) => updateSimpleField('url', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </small>
        </div>

        <!-- image-text -->
        <div v-else-if="props.code === 'image-text'" class="pl-image-text">
          <div class="pl-image-placeholder">
            🖼
            <InlineEdit
              :value="asStr(asObject.alt)"
              :can-edit="canEdit"
              placeholder="Alt image…"
              @update="(v) => updateSimpleField('alt', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </div>
          <p>
            <InlineEdit
              :value="asStr(asObject.text)"
              textarea
              :rows="3"
              :can-edit="canEdit"
              placeholder="Texte associé…"
              @update="(v) => updateSimpleField('text', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </p>
        </div>

        <!-- video -->
        <div v-else-if="props.code === 'video'" class="pl-video">
          <span>▶ Vidéo · </span>
          <InlineEdit
            :value="asStr(asObject.url)"
            :can-edit="canEdit"
            placeholder="URL YouTube / Vimeo…"
            @update="(v) => updateSimpleField('url', v)"
            @edit-attempt="emit('edit-attempt')"
          />
        </div>

        <!-- générique simple -->
        <div v-else>
          <p v-for="f in schema.fields" :key="f.key">
            <small style="color: #666">{{ f.label }}</small>
            <br />
            <InlineEdit
              :value="asStr(asObject[f.key])"
              :textarea="!!f.textarea"
              :rows="2"
              :can-edit="canEdit"
              placeholder="…"
              @update="(v) => updateSimpleField(f.key, v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </p>
        </div>
      </template>

      <template v-else-if="schema?.kind === 'items'">
        <!-- accordion -->
        <div v-if="props.code === 'accordion'" class="fr-accordions-group">
          <section v-for="(it, i) in asArray" :key="i" class="fr-accordion">
            <div class="pl-item-head">
              <strong
                >▸
                <InlineEdit
                  :value="asStr(it.q)"
                  :can-edit="canEdit"
                  :placeholder="`Question ${i + 1}…`"
                  @update="(v) => updateItemField(i, 'q', v)"
                  @edit-attempt="emit('edit-attempt')"
                />
              </strong>
              <span style="flex: 1"></span>
              <button class="pl__btn" type="button" @click="moveItem(i, -1)">↑</button>
              <button class="pl__btn" type="button" @click="moveItem(i, 1)">↓</button>
              <button class="pl__btn pl__btn--danger" type="button" @click="removeItem(i)">
                ×
              </button>
            </div>
            <div class="fr-collapse">
              <InlineEdit
                :value="asStr(it.a)"
                textarea
                :rows="2"
                :can-edit="canEdit"
                placeholder="Réponse…"
                @update="(v) => updateItemField(i, 'a', v)"
                @edit-attempt="emit('edit-attempt')"
              />
            </div>
          </section>
        </div>

        <!-- tabs -->
        <div v-else-if="props.code === 'tabs'" class="pl-tabs">
          <div class="pl-tabs__bar">
            <button
              v-for="(t, i) in asArray"
              :key="i"
              type="button"
              class="pl-tabs__tab"
              :class="{ 'pl-tabs__tab--active': activeTab === i }"
              @click="activeTab = i"
            >
              <InlineEdit
                :value="asStr(t.label)"
                :can-edit="canEdit"
                :placeholder="`Onglet ${i + 1}`"
                @update="(v) => updateItemField(i, 'label', v)"
                @edit-attempt="emit('edit-attempt')"
              />
            </button>
            <button v-if="canEdit" class="pl__btn" type="button" @click="addItem">+</button>
          </div>
          <div class="pl-tabs__panel">
            <InlineEdit
              :value="asStr(asArray[activeTab]?.content)"
              textarea
              :rows="3"
              :can-edit="canEdit"
              placeholder="Contenu…"
              @update="(v) => updateItemField(activeTab, 'content', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </div>
        </div>

        <!-- cards-row & tiles-row -->
        <div v-else-if="['cards-row', 'tiles-row'].includes(props.code)" class="pl-cards">
          <div v-for="(c, i) in asArray" :key="i" class="pl-card">
            <div class="pl-card__head">
              <strong>{{ props.code === 'cards-row' ? 'Carte' : 'Tuile' }} {{ i + 1 }}</strong>
              <span style="flex: 1"></span>
              <button class="pl__btn" type="button" @click="moveItem(i, -1)">↑</button>
              <button class="pl__btn" type="button" @click="moveItem(i, 1)">↓</button>
              <button class="pl__btn pl__btn--danger" type="button" @click="removeItem(i)">
                ×
              </button>
            </div>
            <h4 style="margin: 0.3rem 0">
              <InlineEdit
                :value="asStr(c.title)"
                :can-edit="canEdit"
                placeholder="Titre…"
                @update="(v) => updateItemField(i, 'title', v)"
                @edit-attempt="emit('edit-attempt')"
              />
            </h4>
            <p style="font-size: 0.85rem; color: #555; margin: 0">
              <InlineEdit
                :value="asStr(c.desc)"
                textarea
                :rows="2"
                :can-edit="canEdit"
                placeholder="Description…"
                @update="(v) => updateItemField(i, 'desc', v)"
                @edit-attempt="emit('edit-attempt')"
              />
            </p>
          </div>
        </div>

        <!-- summary -->
        <nav v-else-if="props.code === 'summary'" class="fr-summary" aria-label="Sommaire">
          <p class="fr-summary__title">Sommaire</p>
          <ol class="fr-summary__list">
            <li v-for="(s, i) in asArray" :key="i" class="pl-item-row">
              <InlineEdit
                :value="asStr(s.text)"
                :can-edit="canEdit"
                :placeholder="`Entrée ${i + 1}`"
                @update="(v) => updateItemField(i, 'text', v)"
                @edit-attempt="emit('edit-attempt')"
              />
              <button class="pl__btn" type="button" @click="moveItem(i, -1)">↑</button>
              <button class="pl__btn" type="button" @click="moveItem(i, 1)">↓</button>
              <button class="pl__btn pl__btn--danger" type="button" @click="removeItem(i)">
                ×
              </button>
            </li>
          </ol>
        </nav>

        <!-- downloads -->
        <ul
          v-else-if="['download-block', 'download-links', 'cards-download'].includes(props.code)"
          class="pl-downloads"
        >
          <li v-for="(d, i) in asArray" :key="i" class="pl-item-row">
            📄
            <InlineEdit
              :value="asStr(d.label)"
              :can-edit="canEdit"
              placeholder="Libellé fichier…"
              @update="(v) => updateItemField(i, 'label', v)"
              @edit-attempt="emit('edit-attempt')"
            />
            <small style="color: #888">·</small>
            <InlineEdit
              :value="asStr(d.size)"
              :can-edit="canEdit"
              placeholder="Taille…"
              @update="(v) => updateItemField(i, 'size', v)"
              @edit-attempt="emit('edit-attempt')"
            />
            <span style="flex: 1"></span>
            <button class="pl__btn" type="button" @click="moveItem(i, -1)">↑</button>
            <button class="pl__btn" type="button" @click="moveItem(i, 1)">↓</button>
            <button class="pl__btn pl__btn--danger" type="button" @click="removeItem(i)">×</button>
          </li>
        </ul>

        <!-- bouton ajout dans items (sauf tabs/cards qui le proposent inline) -->
        <button
          v-if="canEdit && !['tabs'].includes(props.code)"
          class="fr-btn fr-btn--secondary fr-btn--sm"
          type="button"
          style="margin-top: 0.5rem"
          @click="addItem"
        >
          {{ schema.addLabel ?? '+ Ajouter' }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pl {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  position: relative;
  transition: border-color 0.15s;
}
.pl--hover {
  border-color: #aaa;
}
.pl__toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed #eee;
  margin-bottom: 0.5rem;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.pl--hover .pl__toolbar {
  opacity: 1;
}
.pl__label {
  font-size: 0.7rem;
  color: #666;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.pl__btn {
  background: none;
  border: 1px solid #ddd;
  border-radius: 3px;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  font-size: 0.85rem;
  cursor: pointer;
  color: #555;
}
.pl__btn:hover {
  background: #f3f3f3;
}
.pl__btn--danger:hover {
  background: #fdd;
  color: #ce0500;
  border-color: #ce0500;
}
.pl__content {
  font-size: 0.95rem;
}
.pl__plain-text {
  background: #fafafa;
  padding: 0.5rem 0.75rem;
  border-radius: 3px;
}
.pl-button-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.pl-image-text {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.75rem;
  align-items: start;
}
.pl-image-placeholder {
  background: #eee;
  padding: 1.5rem 0.5rem;
  text-align: center;
  font-size: 0.85rem;
  color: #666;
  border-radius: 4px;
}
.pl-video {
  background: #1a1a1a;
  color: white;
  padding: 1rem;
  border-radius: 4px;
}
.pl-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
}
.pl-card {
  background: #f7f7ff;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.6rem;
}
.pl-card__head {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 0.3rem;
}
.fr-callout {
  background: #f7f7ff;
  border-left: 4px solid #000091;
  padding: 0.75rem 1rem;
  border-radius: 0 4px 4px 0;
}
.fr-callout__title {
  margin: 0 0 0.3rem;
  font-size: 1.05rem;
  color: #000091;
}
.fr-callout__text {
  margin: 0;
}
.fr-highlight {
  border-left: 4px solid #000091;
  padding: 0.4rem 1rem;
  font-style: normal;
}
.fr-quote {
  margin: 0;
  border-left: 4px solid #6e6e6e;
  padding: 0.4rem 1rem;
  font-style: italic;
}
.preview-code {
  background: #1a1a1a;
  color: #d4d4d4;
  padding: 0.6rem;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
.fr-summary {
  background: #f7f7f7;
  padding: 0.5rem 1rem;
  border-radius: 4px;
}
.fr-summary__title {
  font-weight: 700;
  margin: 0 0 0.3rem;
}
.fr-summary__list {
  margin: 0;
  padding-left: 1.25rem;
}
.fr-accordion {
  border-bottom: 1px solid #ddd;
  padding: 0.4rem 0;
}
.fr-collapse {
  padding: 0.3rem 0 0.3rem 1.5rem;
  color: #555;
}
.pl-tabs__bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #ddd;
  margin-bottom: 0.4rem;
}
.pl-tabs__tab {
  padding: 0.4rem 0.8rem;
  background: none;
  border: 1px solid transparent;
  border-bottom: none;
  cursor: pointer;
  font: inherit;
  color: #555;
}
.pl-tabs__tab--active {
  background: white;
  border-color: #ddd;
  border-bottom: 2px solid white;
  margin-bottom: -2px;
  color: #000091;
  font-weight: 600;
}
.pl-tabs__panel {
  padding: 0.4rem 0;
}
.pl-downloads {
  list-style: none;
  padding: 0;
  margin: 0;
}
.pl-item-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid #eee;
}
.pl-item-head {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 0.2rem;
}
</style>
