<script setup lang="ts">
// Project switcher pour le header : bouton dépliable affichant la liste
// des projets, sélection = redirige vers la même page du projet cible.
//
// Format DSFR : bouton tertiaire avec icône engrenage + chevron, dropdown
// blanc avec items cliquables. Ferme au clic en dehors.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { listProjects, type ProjectListItem } from '../api/projects.api.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const open = ref(false);
const projects = ref<readonly ProjectListItem[]>([]);

const currentSlug = computed(() => String(route.params['slug'] ?? ''));

async function refresh(): Promise<void> {
  try {
    projects.value = await listProjects();
  } catch {
    projects.value = [];
  }
}

onMounted(refresh);
watch(() => auth.user, refresh);

function toggle(): void {
  open.value = !open.value;
}
function close(): void {
  open.value = false;
}
function onDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (!target.closest('.project-switcher')) close();
}
onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

const currentProject = computed(() =>
  currentSlug.value ? projects.value.find((p) => p.slug === currentSlug.value) : null,
);

const buttonLabel = computed(() => {
  if (currentProject.value) return currentProject.value.name;
  return 'Choisir un projet';
});

function switchTo(slug: string): void {
  if (slug === currentSlug.value) {
    close();
    return;
  }
  // Garde la même sous-page si possible
  const segments = route.path.split('/');
  // path = /p/<slug>/<page>... → segment[3] = page
  const page = segments[3] ?? 'arborescence';
  void router.push(`/p/${encodeURIComponent(slug)}/${page}`);
  close();
}
</script>

<template>
  <div class="project-switcher">
    <button
      type="button"
      class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-folder-2-line fr-btn--icon-left"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click.stop="toggle"
    >
      {{ buttonLabel }}
      <span class="project-switcher__caret">{{ open ? '▴' : '▾' }}</span>
    </button>
    <div v-if="open" class="project-switcher__menu" role="menu" @click.stop>
      <p class="project-switcher__heading">Changer de projet</p>
      <ul>
        <li v-if="projects.length === 0" class="project-switcher__empty">Aucun projet visible.</li>
        <li v-for="p in projects" :key="p.slug">
          <button
            type="button"
            class="project-switcher__item"
            :class="{ 'is-current': p.slug === currentSlug }"
            @click="switchTo(p.slug)"
          >
            <span class="project-switcher__item-name">{{ p.name }}</span>
            <code class="project-switcher__item-slug">{{ p.slug }}</code>
            <span v-if="p.slug === currentSlug" class="project-switcher__item-check">✓</span>
          </button>
        </li>
      </ul>
      <div class="project-switcher__footer">
        <RouterLink to="/" class="fr-link fr-link--sm" @click="close">
          ↗ Tous les projets
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-switcher {
  position: relative;
  display: inline-block;
}
.project-switcher__caret {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  color: var(--text-mention-grey, #888);
}
.project-switcher__menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.4rem;
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  min-width: 320px;
  max-width: 420px;
  max-height: 70vh;
  overflow: auto;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 250;
  padding: 0.5rem 0;
}
.project-switcher__heading {
  margin: 0 0.75rem 0.4rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-mention-grey, #888);
}
.project-switcher__menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.project-switcher__empty {
  padding: 0.5rem 0.75rem;
  color: var(--text-mention-grey, #888);
  font-style: italic;
  font-size: 0.9rem;
}
.project-switcher__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: var(--text-default-grey, #161616);
}
.project-switcher__item:hover {
  background: var(--background-alt-blue-france, #f3f3ff);
}
.project-switcher__item.is-current {
  background: var(--background-contrast-info, #e8edff);
  font-weight: 600;
}
.project-switcher__item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-switcher__item-slug {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  color: var(--text-mention-grey, #888);
  background: #f1f1f1;
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
}
.project-switcher__item-check {
  color: var(--text-action-high-blue-france, #000091);
  font-weight: bold;
}
.project-switcher__footer {
  border-top: 1px solid var(--border-default-grey, #eee);
  padding: 0.5rem 0.75rem 0.2rem;
  text-align: right;
}
</style>
