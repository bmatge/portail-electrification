import { z } from 'zod';

export const WriteProjectDataBodySchema = z.object({
  data: z.unknown(),
});

export type WriteProjectDataBody = z.infer<typeof WriteProjectDataBodySchema>;

export const RevertBodySchema = z.object({
  message: z.string().max(200).optional().default(''),
});

export type RevertBody = z.infer<typeof RevertBodySchema>;
