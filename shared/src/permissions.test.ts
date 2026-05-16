import { describe, it, expect } from 'vitest';
import { hasPermission, rolePermissions } from './permissions.js';

describe('shared/permissions', () => {
  it('admin possède toutes les permissions, dont audit:read', () => {
    const perms = rolePermissions('admin');
    expect(perms).toContain('audit:read');
    expect(perms).toContain('project:delete:any');
    expect(perms).toContain('users:invite');
  });

  it('viewer peut lire mais pas écrire l’arbre', () => {
    expect(hasPermission([{ role: 'viewer', projectId: null }], 'tree:read', 1)).toBe(true);
    expect(hasPermission([{ role: 'viewer', projectId: null }], 'tree:write', 1)).toBe(false);
  });

  it('editor scope projet 1 ne peut pas écrire sur projet 2', () => {
    const grants = [{ role: 'editor' as const, projectId: 1 }];
    expect(hasPermission(grants, 'tree:write', 1)).toBe(true);
    expect(hasPermission(grants, 'tree:write', 2)).toBe(false);
  });

  it('editor global a project:delete:own mais pas project:delete:any', () => {
    const grants = [{ role: 'editor' as const, projectId: null }];
    expect(hasPermission(grants, 'project:delete:own', 1)).toBe(true);
    expect(hasPermission(grants, 'project:delete:any', 1)).toBe(false);
  });

  it('admin global remplace n’importe quel scope', () => {
    const grants = [{ role: 'admin' as const, projectId: null }];
    expect(hasPermission(grants, 'project:delete:any', 99)).toBe(true);
  });
});
