import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import HomePage from '../pages/HomePage.vue';
import LoginPage from '../pages/LoginPage.vue';
import CallbackPage from '../pages/CallbackPage.vue';
import NotFoundPage from '../pages/NotFoundPage.vue';
import AdminPage from '../pages/AdminPage.vue';
import { useAuthStore } from '../stores/auth.js';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomePage, meta: { requiresAuth: true } },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/auth/callback', name: 'callback', component: CallbackPage },
  {
    path: '/admin',
    name: 'admin',
    component: AdminPage,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.fetched) await auth.fetchMe();
  if (to.meta['requiresAuth'] && !auth.user) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  if (to.meta['requiresAdmin'] && !auth.isAdmin) {
    return { name: 'not-found' };
  }
  return true;
});
