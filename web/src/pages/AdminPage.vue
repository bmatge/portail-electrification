<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api/client.js';

interface AdminUser {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: string;
  readonly roles: ReadonlyArray<{ role: string; projectId: number | null }>;
}

const users = ref<readonly AdminUser[]>([]);
const audit = ref<ReadonlyArray<{ id: number; action: string; created_at: string }>>([]);

async function refreshUsers(): Promise<void> {
  const res = await api.get('/admin/users');
  users.value = (res.data as { users: readonly AdminUser[] }).users;
}

async function refreshAudit(): Promise<void> {
  const res = await api.get('/admin/audit-log', { params: { limit: 50 } });
  audit.value = (res.data as { entries: typeof audit.value }).entries;
}

async function toggleStatus(u: AdminUser): Promise<void> {
  const action = u.status === 'active' ? 'disable' : 'enable';
  await api.post(`/admin/users/${u.id}/${action}`);
  await refreshUsers();
}

async function grant(u: AdminUser, role: string): Promise<void> {
  await api.post(`/admin/users/${u.id}/roles`, { role });
  await refreshUsers();
}

async function revoke(u: AdminUser, role: string): Promise<void> {
  await api.delete(`/admin/users/${u.id}/roles`, { data: { role } });
  await refreshUsers();
}

onMounted(async () => {
  await Promise.all([refreshUsers(), refreshAudit()]);
});
</script>

<template>
  <div>
    <h1>Administration</h1>

    <section class="l-card">
      <h2>Utilisateurs</h2>
      <table style="width: 100%; border-collapse: collapse">
        <thead>
          <tr style="text-align: left; border-bottom: 1px solid #ddd">
            <th>Email</th>
            <th>Nom</th>
            <th>Statut</th>
            <th>Rôles</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" style="border-bottom: 1px solid #eee">
            <td>{{ u.email ?? '—' }}</td>
            <td>{{ u.display_name }}</td>
            <td>{{ u.status }}</td>
            <td>
              <span
                v-for="r in u.roles"
                :key="`${r.role}-${r.projectId}`"
                style="margin-right: 0.25rem"
              >
                {{ r.role }}{{ r.projectId ? `(${r.projectId})` : '' }}
              </span>
            </td>
            <td>
              <button class="btn btn-outline" @click="toggleStatus(u)">
                {{ u.status === 'active' ? 'Disable' : 'Enable' }}
              </button>
              <button class="btn btn-outline" @click="grant(u, 'editor')">+ editor</button>
              <button class="btn btn-outline" @click="revoke(u, 'editor')">- editor</button>
              <button class="btn btn-outline" @click="grant(u, 'admin')">+ admin</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="l-card">
      <h2>Journal d'audit (50 derniers)</h2>
      <ul>
        <li v-for="e in audit" :key="e.id">
          <small>{{ e.created_at }}</small> — <strong>{{ e.action }}</strong>
        </li>
      </ul>
    </section>
  </div>
</template>
