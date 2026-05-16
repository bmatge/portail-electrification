import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import HomePage from '../pages/HomePage.vue';
import LoginPage from '../pages/LoginPage.vue';
import CallbackPage from '../pages/CallbackPage.vue';
import NotFoundPage from '../pages/NotFoundPage.vue';
import AdminPage from '../pages/AdminPage.vue';
import ProjectLayout from '../pages/ProjectLayout.vue';
import ProjectTreePage from '../pages/ProjectTreePage.vue';
import ProjectRoadmapPage from '../pages/ProjectRoadmapPage.vue';
import ProjectDataPage from '../pages/ProjectDataPage.vue';
import ProjectObjectifsPage from '../pages/ProjectObjectifsPage.vue';
import ProjectMaquettePage from '../pages/ProjectMaquettePage.vue';
import { useAuthStore } from '../stores/auth.js';

const routes: RouteRecordRaw[] = [
  // Home et pages projet : pas de requiresAuth — un anonyme peut consulter
  // les projets publics. L'édition reste gardée côté serveur (RBAC).
  { path: '/', name: 'home', component: HomePage },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/auth/callback', name: 'callback', component: CallbackPage },
  {
    path: '/p/:slug',
    component: ProjectLayout,
    redirect: (to) => ({ name: 'project-tree', params: { slug: to.params['slug'] as string } }),
    children: [
      { path: 'arborescence', name: 'project-tree', component: ProjectTreePage },
      { path: 'roadmap', name: 'project-roadmap', component: ProjectRoadmapPage },
      { path: 'modele', name: 'project-data', component: ProjectDataPage },
      { path: 'objectifs', name: 'project-objectifs', component: ProjectObjectifsPage },
      { path: 'maquette', name: 'project-maquette', component: ProjectMaquettePage },
    ],
  },
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
