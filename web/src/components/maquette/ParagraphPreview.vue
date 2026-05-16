<script setup lang="ts">
// `<ParagraphPreview>` — rend la donnée d'un paragraph en composant DSFR
// réel (accordéon dépliable, callout coloré, cards alignées, tabs, etc.).
// Pendant côté édition de `<ParagraphEditor>` — affichage côte à côte
// dans la page Maquette : on édite à gauche, on voit le rendu à droite.

import { computed, ref } from 'vue';
import { PARAGRAPH_SCHEMAS } from '@latelier/shared';

const props = defineProps<{
  code: string;
  data: unknown;
}>();

const schema = computed(() => PARAGRAPH_SCHEMAS[props.code] ?? null);

const dataAsString = computed(() => (typeof props.data === 'string' ? props.data : ''));
const dataAsObject = computed(
  () =>
    (props.data && typeof props.data === 'object' && !Array.isArray(props.data)
      ? (props.data as Record<string, unknown>)
      : {}) as Record<string, unknown>,
);
const dataAsArray = computed(() =>
  Array.isArray(props.data) ? (props.data as Record<string, unknown>[]) : [],
);

// Tabs interactives (preview accordion utilise <details> natif)
const activeTab = ref(0);

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
</script>

<template>
  <div class="paragraph-preview" v-if="schema">
    <!-- accordion : <details> DSFR -->
    <template v-if="code === 'accordion'">
      <div class="fr-accordions-group">
        <section v-for="(item, i) in dataAsArray" :key="i" class="fr-accordion">
          <h3 class="fr-accordion__title">
            <button class="fr-accordion__btn" aria-expanded="false">
              {{ asStr(item.q) || `Question ${i + 1}` }}
            </button>
          </h3>
          <div class="fr-collapse">
            <p>{{ asStr(item.a) }}</p>
          </div>
        </section>
      </div>
    </template>

    <!-- tabs : DSFR fr-tabs -->
    <template v-else-if="code === 'tabs'">
      <div class="preview-tabs">
        <div class="preview-tabs__bar">
          <button
            v-for="(t, i) in dataAsArray"
            :key="i"
            class="preview-tabs__tab"
            :class="{ 'preview-tabs__tab--active': activeTab === i }"
            type="button"
            @click="activeTab = i"
          >
            {{ asStr(t.label) || `Onglet ${i + 1}` }}
          </button>
        </div>
        <div class="preview-tabs__panel">
          <p>{{ asStr(dataAsArray[activeTab]?.content) }}</p>
        </div>
      </div>
    </template>

    <!-- cards-row : cartes alignées -->
    <template v-else-if="code === 'cards-row'">
      <div class="preview-cards">
        <div
          v-for="(c, i) in dataAsArray"
          :key="i"
          class="fr-card fr-card--horizontal-tier preview-card"
        >
          <div class="fr-card__body">
            <div class="fr-card__content">
              <h3 class="fr-card__title">{{ asStr(c.title) || `Carte ${i + 1}` }}</h3>
              <p class="fr-card__desc">{{ asStr(c.desc) }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- tiles-row : tuiles -->
    <template v-else-if="code === 'tiles-row'">
      <div class="preview-cards">
        <div v-for="(t, i) in dataAsArray" :key="i" class="fr-tile preview-tile">
          <div class="fr-tile__body">
            <h3 class="fr-tile__title">{{ asStr(t.title) || `Tuile ${i + 1}` }}</h3>
            <p class="fr-tile__desc">{{ asStr(t.desc) }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- summary : liste numérotée -->
    <template v-else-if="code === 'summary'">
      <nav class="fr-summary" aria-label="Sommaire">
        <p class="fr-summary__title">Sommaire</p>
        <ol class="fr-summary__list">
          <li v-for="(s, i) in dataAsArray" :key="i">
            <a class="fr-summary__link" href="#">{{ asStr(s.text) || `Entrée ${i + 1}` }}</a>
          </li>
        </ol>
      </nav>
    </template>

    <!-- download-block / download-links / cards-download : liste fichiers -->
    <template v-else-if="['download-block', 'download-links', 'cards-download'].includes(code)">
      <ul class="preview-downloads">
        <li v-for="(d, i) in dataAsArray" :key="i" class="preview-download">
          <span style="margin-right: 0.5rem">📄</span>
          <strong>{{ asStr(d.label) || `Fichier ${i + 1}` }}</strong>
          <small v-if="d.size" style="color: #888; margin-left: 0.5rem"
            >({{ asStr(d.size) }})</small
          >
        </li>
      </ul>
    </template>

    <!-- button : bouton DSFR -->
    <template v-else-if="code === 'button'">
      <a class="fr-btn" :href="asStr(dataAsObject.url) || '#'">
        {{ asStr(dataAsObject.label) || 'Bouton' }}
      </a>
    </template>

    <!-- callout : encadré DSFR -->
    <template v-else-if="code === 'callout'">
      <div class="fr-callout">
        <h3 class="fr-callout__title">{{ asStr(dataAsObject.title) || 'À retenir' }}</h3>
        <p class="fr-callout__text">{{ asStr(dataAsObject.text) }}</p>
      </div>
    </template>

    <!-- image-text -->
    <template v-else-if="code === 'image-text'">
      <div class="preview-image-text">
        <div class="preview-image-placeholder">🖼 {{ asStr(dataAsObject.alt) || 'image' }}</div>
        <p>{{ asStr(dataAsObject.text) }}</p>
      </div>
    </template>

    <!-- video : iframe placeholder -->
    <template v-else-if="code === 'video'">
      <div class="preview-video">
        <span>▶ Vidéo</span>
        <small v-if="dataAsObject.url" style="color: #888"> · {{ asStr(dataAsObject.url) }}</small>
      </div>
    </template>

    <!-- highlight : mise en exergue -->
    <template v-else-if="code === 'highlight'">
      <div class="fr-highlight">
        <p>{{ dataAsString }}</p>
      </div>
    </template>

    <!-- quote : verbatim -->
    <template v-else-if="code === 'quote'">
      <figure class="fr-quote">
        <blockquote>
          <p>« {{ dataAsString }} »</p>
        </blockquote>
      </figure>
    </template>

    <!-- auto-list : liste auto -->
    <template v-else-if="code === 'auto-list'">
      <div class="preview-auto-list">
        <small style="color: #888">Liste auto-générée :</small>
        <p>{{ dataAsString || '(aucune donnée)' }}</p>
      </div>
    </template>

    <!-- code : bloc code -->
    <template v-else-if="code === 'code'">
      <pre class="preview-code">{{ dataAsString }}</pre>
    </template>

    <!-- table : tableau -->
    <template v-else-if="code === 'table'">
      <div class="preview-table">
        <small style="color: #888">📊 Tableau :</small>
        <p>{{ dataAsString || '(à venir)' }}</p>
      </div>
    </template>

    <template v-else>
      <p style="color: #888; font-style: italic">Aperçu indisponible pour ce type ({{ code }}).</p>
    </template>
  </div>
</template>

<style scoped>
.paragraph-preview {
  background: white;
  border: 1px dashed #888;
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 0.5rem;
}

/* Tabs custom preview (le fr-tabs natif demande une logique JS qu'on n'a pas) */
.preview-tabs__bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #ddd;
  margin-bottom: 0.5rem;
}
.preview-tabs__tab {
  padding: 0.4rem 0.9rem;
  background: none;
  border: 1px solid transparent;
  border-bottom: none;
  cursor: pointer;
  font: inherit;
  color: #555;
}
.preview-tabs__tab--active {
  background: white;
  border-color: #ddd;
  border-bottom: 2px solid white;
  margin-bottom: -2px;
  color: #000091;
  font-weight: 600;
}
.preview-tabs__panel {
  padding: 0.5rem 0;
}

/* Cards / tiles */
.preview-cards {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.preview-card,
.preview-tile {
  background: #f7f7ff;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.75rem;
}
.preview-card h3,
.preview-tile h3 {
  margin: 0 0 0.3rem;
  font-size: 1rem;
}
.preview-card p,
.preview-tile p {
  margin: 0;
  font-size: 0.85rem;
  color: #555;
}

/* Downloads */
.preview-downloads {
  list-style: none;
  padding: 0;
  margin: 0;
}
.preview-download {
  padding: 0.4rem 0;
  border-bottom: 1px solid #eee;
}

/* Image-text */
.preview-image-text {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.75rem;
  align-items: center;
}
.preview-image-placeholder {
  background: #eee;
  border-radius: 4px;
  padding: 1.5rem 0.75rem;
  text-align: center;
  color: #888;
  font-size: 0.85rem;
}

/* Video */
.preview-video {
  background: #1a1a1a;
  color: white;
  padding: 1.5rem;
  text-align: center;
  border-radius: 4px;
}

/* Highlight / quote */
.fr-highlight {
  border-left: 4px solid #000091;
  padding-left: 1rem;
}
.fr-quote {
  border-left: 4px solid #6e6e6e;
  padding-left: 1rem;
  font-style: italic;
}

/* Code */
.preview-code {
  background: #1a1a1a;
  color: #d4d4d4;
  padding: 0.75rem;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  overflow-x: auto;
}

/* Accordéon visuel léger sur les details natifs */
.fr-accordion {
  border-bottom: 1px solid #ddd;
  padding: 0.4rem 0;
}
.fr-accordion__btn {
  background: none;
  border: none;
  padding: 0;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.fr-accordion__btn::before {
  content: '▸ ';
  font-size: 0.85em;
  margin-right: 0.25rem;
}
.fr-collapse {
  padding: 0.4rem 1rem 0.4rem 1.25rem;
  color: #555;
}

/* Summary */
.fr-summary {
  background: #f7f7f7;
  padding: 0.75rem 1rem;
  border-radius: 4px;
}
.fr-summary__title {
  font-weight: 700;
  margin: 0 0 0.5rem;
}
.fr-summary__list {
  margin: 0;
  padding-left: 1.25rem;
}

/* Callout */
.fr-callout {
  background: #f7f7ff;
  border-left: 4px solid #000091;
  padding: 1rem;
}
.fr-callout__title {
  margin: 0 0 0.3rem;
  font-size: 1.05rem;
  color: #000091;
}
.fr-callout__text {
  margin: 0;
}
</style>
