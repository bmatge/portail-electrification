import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Permission } from '@latelier/shared';
import { hasPermission } from '@latelier/shared';
import * as authApi from '../api/auth.api.js';
import type { MeUser } from '../api/auth.api.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<MeUser | null>(null);
  const fetched = ref(false);

  async function fetchMe(): Promise<MeUser | null> {
    user.value = await authApi.fetchMe();
    fetched.value = true;
    return user.value;
  }

  async function requestLogin(email: string): Promise<void> {
    await authApi.requestMagicLink(email);
  }

  async function consumeCallback(token: string): Promise<void> {
    await authApi.consumeCallback(token);
    await fetchMe();
  }

  async function logout(): Promise<void> {
    await authApi.logout();
    user.value = null;
  }

  const isAdmin = computed(() =>
    user.value ? user.value.roles.some((r) => r.role === 'admin' && r.projectId === null) : false,
  );

  function can(permission: Permission, projectId: number | null = null): boolean {
    if (!user.value) return false;
    const grants = user.value.roles.map((r) => ({ role: r.role, projectId: r.projectId }));
    return hasPermission(grants, permission, projectId);
  }

  return { user, fetched, fetchMe, requestLogin, consumeCallback, logout, isAdmin, can };
});
