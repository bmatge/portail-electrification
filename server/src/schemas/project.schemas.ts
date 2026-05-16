import { z } from 'zod';

export const CreateProjectBodySchema = z.object({
  slug: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1, 'name_required').max(100),
  description: z.string().trim().max(500).optional().default(''),
});

export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;

export const ImportProjectBodySchema = z.object({
  bundle: z.record(z.string(), z.unknown()),
  slug: z.string().trim().optional(),
});

export type ImportProjectBody = z.infer<typeof ImportProjectBodySchema>;
