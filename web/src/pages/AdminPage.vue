<script setup lang="ts">
// Page Admin v2 : gestion users + rôles per-project + invitation + audit.
//
// Toutes les actions vont via /api/admin/* (sauf l'invitation qui utilise
// /api/auth/magic-link, public anti-énumération avec rate-limit). L'admin
// invite un email → l'user reçoit le magic link, se logge → viewer global
// auto → admin retourne ici pour granter le rôle souhaité.

import { computed, onMounted, ref } from 'vue';
import { api } from '../api/client.js';
import { useConfirm } from '../stores/confirm.js';

const confirmStore = useConfirm();

interface RoleGrant {
  readonly role: 'admin' | 'editor' | 'viewer';
  readonly projectId: number | null;
}
interface AdminUser {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
  readonly roles: readonly RoleGrant[];
}
interface AuditEntry {
  readonly id: number;
  readonly action: string;
  readonly created_at: string;
  readonly actor_id: number | null;
  readonly project_id: number | null;
  readonly details: string | null;
}
interface ProjectLite {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

const users = ref<readonly AdminUser[]>([]);
const audit = ref<readonly AuditEntry[]>([]);
const projects = ref<readonly ProjectLite[]>([]);
const loading = ref(false);
const errorMsg = ref<string | null>(null);
const search = ref('');

// Invitation
const invitingEmail = ref('');
const invitationStatus = ref<'idle' | 'sending' | 'sent' | 'error'>('idle');
const invitationError = ref<string | null>(null);

// Modal "Ajouter un rôle"
const grantModalUser = ref<AdminUser | null>(null);
const grantModalRole = ref<'admin' | 'editor' | 'viewer'>('editor');
const grantModalProject = ref<number | 'global'>('global');

async function refresh(): Promise<void> {
  loading.value = true;
  errorMsg.value = null;
  try {
    const [u, a, p] = await Promise.all([
      api.get('/admin/users'),
      api.get('/admin/audit-log', { params: { limit: 50 } }),
      api.get('/projects'),
    ]);
    users.value = (u.data as { users: readonly AdminUser[] }).users;
    audit.value = (a.data as { entries: readonly AuditEntry[] }).entries;
    projects.value = (p.data as { projects: readonly ProjectLite[] }).projects;
  } catch (e) {
    errorMsg.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

const projectSlugById = computed(() => {
  const map = new Map<number, string>();
  for (const p of projects.value) map.set(p.id, p.slug);
  return map;
});

function formatRole(r: RoleGrant): string {
  const scope =
    r.projectId === null ? 'global' : (projectSlugById.value.get(r.projectId) ?? `#${r.projectId}`);
  return `${r.role} (${scope})`;
}

const filteredUsers = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return users.value;
  return users.value.filter(
    (u) =>
      (u.email ?? '').toLowerCase().includes(term) ||
      u.display_name.toLowerCase().includes(term) ||
      u.roles.some((r) => r.role.includes(term)),
  );
});

async function toggleStatus(u: AdminUser): Promise<void> {
  const action = u.status === 'active' ? 'disable' : 'enable';
  await api.post(`/admin/users/${u.id}/${action}`);
  await refresh();
}

function openGrantModal(u: AdminUser): void {
  grantModalUser.value = u;
  grantModalRole.value = 'editor';
  grantModalProject.value = 'global';
}

function closeGrantModal(): void {
  grantModalUser.value = null;
}

async function applyGrant(): Promise<void> {
  if (!grantModalUser.value) return;
  const payload: { role: string; project_id?: number } = { role: grantModalRole.value };
  if (grantModalProject.value !== 'global') payload.project_id = grantModalProject.value;
  await api.post(`/admin/users/${grantModalUser.value.id}/roles`, payload);
  closeGrantModal();
  await refresh();
}

async function revoke(u: AdminUser, r: RoleGrant): Promise<void> {
  const scope =
    r.projectId === null ? 'global' : (projectSlugById.value.get(r.projectId) ?? '#' + r.projectId);
  const ok = await confirmStore.ask({
    title: `Retirer le rôle « ${r.role} » ?`,
    message: `L'utilisateur ${u.email ?? u.display_name} perdra son rôle ${r.role} sur le scope ${scope}.`,
    confirmLabel: 'Retirer le rôle',
    danger: true,
  });
  if (!ok) return;
  const body: { role: string; project_id?: number | null } = { role: r.role };
  if (r.projectId !== null) body.project_id = r.projectId;
  await api.delete(`/admin/users/${u.id}/roles`, { data: body });
  await refresh();
}

async function sendInvitation(): Promise<void> {
  const email = invitingEmail.value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    invitationError.value = 'Email invalide';
    invitationStatus.value = 'error';
    return;
  }
  invitationStatus.value = 'sending';
  invitationError.value = null;
  try {
    await api.post('/auth/magic-link', { email });
    invitationStatus.value = 'sent';
    invitingEmail.value = '';
    setTimeout(() => {
      invitationStatus.value = 'idle';
    }, 4000);
  } catch (e) {
    invitationError.value = (e as Error).message;
    invitationStatus.value = 'error';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
</script>

<template>
  <div>
    <h1>Administration</h1>

    <p v-if="loading" style="color: #888">Chargement…</p>
    <p v-else-if="errorMsg" class="alert alert-error">{{ errorMsg }}</p>

    <!-- Invitation par email -->
    <section class="l-card">
      <h2 style="margin-top: 0">Inviter un utilisateur</h2>
      <p style="font-size: 0.9rem; color: #555">
        Envoie un magic link à un email. La personne clique → compte créé en <code>viewer</code>
        global. Pour donner d'autres rôles, utilisez ensuite le bouton « + rôle » dans la liste.
      </p>
      <form
        @submit.prevent="sendInvitation"
        style="display: flex; gap: 0.5rem; align-items: center"
      >
        <input
          v-model="invitingEmail"
          type="email"
          class="fr-input"
          placeholder="email@example.fr"
          required
          style="flex: 1; max-width: 320px"
        />
        <button class="fr-btn" type="submit" :disabled="invitationStatus === 'sending'">
          {{ invitationStatus === 'sending' ? 'Envoi…' : '✉ Envoyer le magic link' }}
        </button>
        <span v-if="invitationStatus === 'sent'" style="color: #18753c">✓ Lien envoyé</span>
        <span v-else-if="invitationStatus === 'error'" style="color: #ce0500">
          {{ invitationError }}
        </span>
      </form>
    </section>

    <!-- Liste users + recherche -->
    <section class="l-card">
      <div class="toolbar" style="margin: 0 0 0.75rem">
        <h2 style="margin: 0">Utilisateurs ({{ users.length }})</h2>
        <span class="spacer"></span>
        <input
          v-model="search"
          type="search"
          class="fr-input"
          placeholder="🔍 Filtrer par email / nom / rôle…"
          style="min-width: 260px"
        />
        <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="refresh">↻ Recharger</button>
      </div>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Nom</th>
            <th>Statut</th>
            <th>Rôles</th>
            <th style="width: 220px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filteredUsers" :key="u.id">
            <td>{{ u.email ?? '—' }}</td>
            <td>{{ u.display_name }}</td>
            <td>
              <span
                class="badge"
                :class="{
                  'badge-public': u.status === 'active',
                  'badge-private': u.status === 'disabled',
                }"
              >
                {{ u.status }}
              </span>
            </td>
            <td>
              <span v-if="u.roles.length === 0" style="color: #888; font-style: italic">
                aucun
              </span>
              <span
                v-for="r in u.roles"
                :key="`${r.role}-${r.projectId ?? 'g'}`"
                class="role-tag"
                :title="formatRole(r)"
              >
                {{ r.role }}
                <small v-if="r.projectId !== null" style="color: #444">
                  · {{ projectSlugById.get(r.projectId) ?? `#${r.projectId}` }}
                </small>
                <small v-else style="color: #444">· global</small>
                <button
                  class="role-tag__x"
                  title="Retirer ce rôle"
                  type="button"
                  @click="revoke(u, r)"
                >
                  ×
                </button>
              </span>
            </td>
            <td>
              <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="openGrantModal(u)">
                + rôle
              </button>
              <button class="fr-btn fr-btn--tertiary fr-btn--sm" @click="toggleStatus(u)">
                {{ u.status === 'active' ? '🚫 Désactiver' : '✓ Réactiver' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Audit log -->
    <section class="l-card">
      <h2 style="margin-top: 0">Journal d'audit (50 derniers)</h2>
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 140px">Quand</th>
            <th>Action</th>
            <th style="width: 80px">Acteur</th>
            <th style="width: 100px">Projet</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in audit" :key="e.id">
            <td>
              <small>{{ formatDate(e.created_at) }}</small>
            </td>
            <td>
              <code>{{ e.action }}</code>
            </td>
            <td>{{ e.actor_id ?? '—' }}</td>
            <td>
              {{
                e.project_id === null
                  ? '—'
                  : (projectSlugById.get(e.project_id) ?? `#${e.project_id}`)
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Modal grant -->
    <div v-if="grantModalUser" class="modal-backdrop" @click.self="closeGrantModal">
      <div class="modal" role="dialog" aria-modal="true">
        <h2 style="margin-top: 0">
          Ajouter un rôle à {{ grantModalUser.email ?? grantModalUser.display_name }}
        </h2>
        <label class="field">
          <span>Rôle</span>
          <select v-model="grantModalRole" class="fr-select">
            <option value="viewer">viewer — lecture seule + commentaires</option>
            <option value="editor">editor — édition tree/data + delete own project</option>
            <option value="admin">admin — toutes les permissions</option>
          </select>
        </label>
        <label class="field">
          <span>Périmètre</span>
          <select v-model="grantModalProject" class="fr-select">
            <option value="global">🌐 Global (tous les projets)</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">
              📁 {{ p.slug }} — {{ p.name }}
            </option>
          </select>
        </label>
        <p style="font-size: 0.85rem; color: #666; margin-top: 0.75rem">
          <strong>Rappel</strong> : un grant global s'applique à tous les projets. Un grant
          per-project ne s'applique qu'à ce projet.
        </p>
        <div class="actions" style="display: flex; gap: 0.5rem; margin-top: 1rem">
          <button class="fr-btn" type="button" @click="applyGrant">Accorder</button>
          <button class="fr-btn fr-btn--secondary" type="button" @click="closeGrantModal">
            Annuler
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.admin-table th {
  text-align: left;
  border-bottom: 2px solid #ddd;
  padding: 0.5rem;
  background: #fafafa;
  font-weight: 600;
}
.admin-table td {
  border-bottom: 1px solid #eee;
  padding: 0.4rem 0.5rem;
}
.admin-table tr:hover td {
  background: #f9f9ff;
}
.role-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #e3e3fd;
  color: #00146b;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.8rem;
  margin-right: 0.25rem;
}
.role-tag__x {
  background: none;
  border: none;
  color: #ce0500;
  cursor: pointer;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  margin-left: 0.25rem;
}
.role-tag__x:hover {
  color: #6e0c0c;
}
.spacer {
  flex: 1;
}
</style>
