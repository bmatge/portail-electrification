<script setup lang="ts">
// Header DSFR officiel — Marianne + devise + service + outils (identité user
// + lien Code source + project switcher quand on est dans un projet).
//
// Quand on est dans un projet (slug présent), une seconde barre de
// navigation s'affiche sous le header avec les 8 onglets du projet
// (cf. nav legacy `assets/layout.js`).

import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useProjectStore } from '../stores/project.js';
import UserMenu from './UserMenu.vue';
import ProjectSwitcher from './ProjectSwitcher.vue';

const auth = useAuthStore();
const projectStore = useProjectStore();
const route = useRoute();

const slug = computed(() => String(route.params['slug'] ?? ''));
const inProject = computed(() => !!slug.value);

const tagline = computed(() => {
  if (projectStore.project) return `Projet : ${projectStore.project.name}`;
  if (slug.value) return '…';
  return 'Aucun projet sélectionné';
});

// Nav projet dans le header.
const projectTabs = [
  { name: 'project-objectifs', label: 'Objectifs du site' },
  { name: 'project-tree', label: 'Arborescence' },
  { name: 'project-maquette', label: 'Maquette' },
  { name: 'project-roadmap', label: 'Roadmap' },
  { name: 'project-dispositifs', label: 'Ressources & services' },
  { name: 'project-data', label: 'Modèle de données' },
  { name: 'project-mesures', label: 'Politiques publiques' },
  { name: 'project-history', label: 'Historique' },
] as const;
</script>

<template>
  <header role="banner" class="fr-header">
    <div class="fr-header__body">
      <div class="fr-container">
        <div class="fr-header__body-row">
          <!-- Note : volontairement SANS `fr-enlarge-link` ici, sinon les
               clics sur le ProjectSwitcher en dessous seraient interceptés
               et redirigés vers la home. Le lien explicite sur le titre
               suffit pour la nav d'accueil. -->
          <div class="fr-header__brand">
            <div class="fr-header__brand-top">
              <div class="fr-header__logo">
                <p class="fr-logo">République<br />Française</p>
              </div>
            </div>
            <div class="fr-header__service">
              <RouterLink
                to="/"
                class="fr-header__service-link"
                title="Accueil — Sélection de projet"
              >
                <p class="fr-header__service-title">L'atelier 🪢</p>
              </RouterLink>
              <div class="app-header-tagline">
                <ProjectSwitcher v-if="inProject" />
                <p v-else class="fr-header__service-tagline">{{ tagline }}</p>
              </div>
            </div>
          </div>
          <div class="fr-header__tools">
            <div class="fr-header__tools-links">
              <ul class="fr-btns-group fr-btns-group--inline app-header-tools">
                <li v-if="auth.user">
                  <UserMenu />
                </li>
                <li v-else>
                  <RouterLink
                    class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-account-line fr-btn--icon-left"
                    to="/login"
                  >
                    S'identifier
                  </RouterLink>
                </li>
                <li v-if="auth.isAdmin">
                  <RouterLink
                    class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-settings-5-line fr-btn--icon-left"
                    to="/admin"
                  >
                    Admin
                  </RouterLink>
                </li>
                <li>
                  <a
                    class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-github-fill fr-btn--icon-left"
                    href="https://github.com/bmatge/latelier-cadrage-site"
                    target="_blank"
                    rel="noopener"
                  >
                    Code source
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Nav projet : visible uniquement quand on est dans un projet -->
    <nav
      v-if="inProject"
      class="fr-nav project-nav"
      role="navigation"
      aria-label="Sections du projet"
    >
      <div class="fr-container">
        <ul class="fr-nav__list project-nav__list">
          <li v-for="t in projectTabs" :key="t.name" class="fr-nav__item">
            <RouterLink class="fr-nav__link" :to="{ name: t.name, params: { slug } }">
              {{ t.label }}
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.app-header-tools {
  align-items: center;
  gap: 0.6rem;
}
.fr-header__service-link {
  text-decoration: none;
  color: inherit;
}
.fr-header__service-link:hover .fr-header__service-title {
  color: var(--text-action-high-blue-france, #000091);
}
.app-header-tagline {
  margin-top: 0.4rem;
}
.app-header-tagline :deep(.project-switcher) {
  display: inline-block;
}
.app-header-tagline :deep(.project-switcher .fr-btn) {
  background: var(--background-alt-blue-france, #e3e3fd);
  color: var(--text-action-high-blue-france, #000091);
  font-weight: 600;
  font-size: 0.95rem;
}
.app-header-tagline :deep(.project-switcher .fr-btn:hover) {
  background: #d4d4f7;
}
.project-nav {
  background: white;
  border-top: 1px solid var(--border-default-grey, #ddd);
  border-bottom: 1px solid var(--border-default-grey, #ddd);
}
.project-nav__list {
  display: flex;
  gap: 0;
  flex-wrap: wrap;
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-x: auto;
}
.project-nav__list :deep(.fr-nav__link) {
  padding: 0.7rem 1rem;
  font-size: 0.95rem;
  white-space: nowrap;
  position: relative;
  display: block;
  color: var(--text-default-grey, #161616);
  text-decoration: none;
  font-weight: 500;
}
.project-nav__list :deep(.fr-nav__link:hover) {
  color: var(--text-action-high-blue-france, #000091);
  background: var(--background-alt-blue-france, #f3f3ff);
}
.project-nav__list :deep(.fr-nav__link.router-link-active) {
  color: var(--text-action-high-blue-france, #000091);
  box-shadow: inset 0 -2px 0 currentColor;
  font-weight: 600;
}
</style>
