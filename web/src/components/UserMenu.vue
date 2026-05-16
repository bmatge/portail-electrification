<script setup lang="ts">
// Dropdown utilisateur affichant : nom + email, liste des rôles, bouton
// déconnexion. Affiché dans le header quand auth.user existe.

import { computed, ref, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const open = ref(false);

function toggle(): void {
  open.value = !open.value;
}
function close(): void {
  open.value = false;
}

// Ferme le menu si clic en dehors
function onDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (!target.closest('.user-menu')) close();
}
document.addEventListener('click', onDocumentClick);
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

async function handleLogout(): Promise<void> {
  await auth.logout();
  close();
}

const grantedRoles = computed(() => auth.user?.roles ?? []);

function scopeLabel(projectId: number | null): string {
  return projectId === null ? 'global' : `projet #${projectId}`;
}
</script>

<template>
  <div v-if="auth.user" class="user-menu">
    <button class="user-menu__trigger" type="button" @click.stop="toggle">
      <strong>{{ auth.user.display_name }}</strong>
      <small style="color: #666; margin-left: 0.4rem">▾</small>
    </button>
    <div v-if="open" class="user-menu__dropdown" @click.stop>
      <p class="user-menu__email">{{ auth.user.email ?? "(pas d'email)" }}</p>
      <p class="user-menu__status">
        Statut : <strong>{{ auth.user.status }}</strong>
      </p>
      <p class="user-menu__section-title">Mes rôles</p>
      <ul class="user-menu__roles">
        <li v-if="grantedRoles.length === 0" style="color: #888; font-style: italic">
          Aucun rôle attribué.
        </li>
        <li v-for="(r, i) in grantedRoles" :key="i">
          <span class="role-tag-mini">{{ r.role }}</span>
          <small style="color: #666"> · {{ scopeLabel(r.projectId) }}</small>
        </li>
      </ul>
      <p v-if="auth.isAdmin" class="user-menu__hint">
        💡 Vous êtes <strong>admin</strong> : accès à <code>/admin</code>.
      </p>
      <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="handleLogout">Déconnexion</button>
    </div>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}
.user-menu__trigger {
  background: none;
  border: 1px solid transparent;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
.user-menu__trigger:hover {
  background: #f3f3ff;
  border-color: #ddd;
}
.user-menu__dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.4rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.75rem 1rem;
  min-width: 280px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 200;
}
.user-menu__email {
  margin: 0 0 0.25rem;
  color: #666;
  font-size: 0.85rem;
}
.user-menu__status {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
}
.user-menu__section-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #888;
  margin: 0.5rem 0 0.25rem;
  letter-spacing: 0.05em;
}
.user-menu__roles {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
}
.user-menu__roles li {
  padding: 0.15rem 0;
  font-size: 0.9rem;
}
.role-tag-mini {
  display: inline-block;
  background: #e3e3fd;
  color: #00146b;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
}
.user-menu__hint {
  font-size: 0.8rem;
  color: #555;
  margin: 0.5rem 0;
}
</style>
