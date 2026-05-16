<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth.js';

const auth = useAuthStore();
onMounted(() => {
  void auth.fetchMe();
});

async function handleLogout(): Promise<void> {
  await auth.logout();
}
</script>

<template>
  <div>
    <header class="l-container" style="display: flex; align-items: center; gap: 1rem">
      <RouterLink to="/" style="font-weight: 700; font-size: 1.2rem; text-decoration: none">
        L'atelier 🪢
      </RouterLink>
      <nav style="flex: 1">
        <RouterLink to="/" style="margin-right: 1rem">Projets</RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin">Admin</RouterLink>
      </nav>
      <div v-if="auth.user">
        <span style="margin-right: 0.5rem"
          >{{ auth.user.display_name }}
          <small style="color: #888">({{ auth.user.email }})</small></span
        >
        <button class="btn btn-outline" @click="handleLogout">Déconnexion</button>
      </div>
      <RouterLink v-else class="btn" to="/login">Se connecter</RouterLink>
    </header>
    <main class="l-container">
      <RouterView />
    </main>
  </div>
</template>
