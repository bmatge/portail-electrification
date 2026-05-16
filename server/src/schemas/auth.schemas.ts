import { z } from 'zod';

export const IdentifyBodySchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(60, 'name_too_long'),
});

export type IdentifyBody = z.infer<typeof IdentifyBodySchema>;
