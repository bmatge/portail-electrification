<script setup lang="ts">
// Dropdown utilisateur DSFR « Mon espace » — bouton tertiary avec icône
// account-line + chevron, dropdown avec sections séparées (identité,
// rôles, déconnexion). Aligné avec le pattern fr-header__tools.

import { computed, ref, onBeforeUnmount, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const open = ref(false);

function toggle(): void {
  open.value = !open.value;
}
function close(): void {
  open.value = false;
}

function onDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (!target.closest('.user-menu')) close();
}
onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

async function handleLogout(): Promise<void> {
  await auth.logout();
  close();
}

const grantedRoles = computed(() => auth.user?.roles ?? []);

function scopeLabel(projectId: number | null): string {
  return projectId === null ? 'global' : `projet #${projectId}`;
}

const triggerLabel = computed(() => auth.user?.display_name ?? 'Mon espace');
</script>

<template>
  <div v-if="auth.user" class="user-menu">
    <button
      type="button"
      class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-account-line fr-btn--icon-left user-menu__trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click.stop="toggle"
    >
      {{ triggerLabel }}
      <span class="user-menu__caret" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-if="open" class="user-menu__dropdown" role="menu" @click.stop>
      <header class="user-menu__head">
        <p class="user-menu__name">{{ auth.user.display_name }}</p>
        <p class="user-menu__email">{{ auth.user.email ?? "(pas d'email)" }}</p>
        <p class="user-menu__status">
          Statut :
          <span
            class="fr-tag fr-tag--sm"
            :class="
              auth.user.status === 'active'
                ? 'user-menu__status--active'
                : 'user-menu__status--disabled'
            "
          >
            {{ auth.user.status }}
          </span>
        </p>
      </header>

      <section class="user-menu__section">
        <p class="user-menu__section-title">Mes rôles</p>
        <ul class="user-menu__roles">
          <li v-if="grantedRoles.length === 0" class="user-menu__empty">Aucun rôle attribué.</li>
          <li v-for="(r, i) in grantedRoles" :key="i" class="user-menu__role">
            <span class="role-tag-mini">{{ r.role }}</span>
            <small class="user-menu__role-scope">· {{ scopeLabel(r.projectId) }}</small>
          </li>
        </ul>
        <p v-if="auth.isAdmin" class="user-menu__hint">
          💡 Vous êtes <strong>admin</strong> : accès à <code>/admin</code>.
        </p>
      </section>

      <footer class="user-menu__footer">
        <button
          type="button"
          class="fr-btn fr-btn--secondary fr-btn--sm fr-icon-logout-box-r-line fr-btn--icon-left"
          @click="handleLogout"
        >
          Se déconnecter
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}
.user-menu__trigger {
  /* fr-btn--tertiary gère déjà bg / border / hover. On ajoute juste
   * un peu d'espace pour le chevron et stabilise la largeur. */
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-menu__caret {
  margin-left: 0.5rem;
  font-size: 0.7rem;
  color: var(--text-mention-grey, #666);
}

.user-menu__dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.4rem;
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  min-width: 300px;
  max-width: 360px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 250;
  overflow: hidden;
}

/* Header : nom + email + statut */
.user-menu__head {
  padding: 0.9rem 1rem;
  border-bottom: 1px solid var(--border-default-grey, #eee);
  background: #fafaff;
}
.user-menu__name {
  margin: 0 0 0.15rem;
  font-weight: 700;
  color: var(--text-action-high-blue-france, #000091);
}
.user-menu__email {
  margin: 0 0 0.4rem;
  color: var(--text-mention-grey, #666);
  font-size: 0.85rem;
  word-break: break-all;
}
.user-menu__status {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-mention-grey, #666);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.user-menu__status--active {
  background-color: #d3f0d4;
  color: #1c4a0e;
}
.user-menu__status--disabled {
  background-color: #f1d9d9;
  color: #6e0c0c;
}

/* Section corps : rôles + hint */
.user-menu__section {
  padding: 0.8rem 1rem;
}
.user-menu__section-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-mention-grey, #888);
  margin: 0 0 0.4rem;
  font-weight: 600;
}
.user-menu__roles {
  list-style: none;
  padding: 0;
  margin: 0 0 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.user-menu__role {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
}
.user-menu__role-scope {
  color: var(--text-mention-grey, #666);
}
.user-menu__empty {
  color: var(--text-mention-grey, #888);
  font-style: italic;
  font-size: 0.9rem;
}
.role-tag-mini {
  display: inline-block;
  background: var(--background-alt-blue-france, #e3e3fd);
  color: var(--text-action-high-blue-france, #00146b);
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.user-menu__hint {
  font-size: 0.78rem;
  color: var(--text-mention-grey, #555);
  margin: 0.5rem 0 0;
  padding: 0.4rem 0.5rem;
  background: var(--background-alt-blue-france, #f3f3ff);
  border-radius: 3px;
}
.user-menu__hint code {
  background: white;
  padding: 0 0.3rem;
  border-radius: 2px;
  font-size: 0.78rem;
}

/* Footer : bouton déconnexion */
.user-menu__footer {
  padding: 0.6rem 1rem 0.8rem;
  border-top: 1px solid var(--border-default-grey, #eee);
  background: #fafafa;
}
.user-menu__footer .fr-btn {
  width: 100%;
  justify-content: center;
}
</style>
