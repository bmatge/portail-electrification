import { z } from 'zod';

export const GrantRoleBodySchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
  project_id: z.number().int().positive().nullable().optional(),
});

export type GrantRoleBody = z.infer<typeof GrantRoleBodySchema>;

export const AuditQuerySchema = z.object({
  action: z.string().optional(),
  project_id: z.coerce.number().int().positive().optional(),
  actor_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  before: z.coerce.number().int().positive().optional(),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
