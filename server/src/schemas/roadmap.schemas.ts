import { z } from 'zod';

export const SaveRoadmapBodySchema = z.object({
  roadmap: z
    .record(z.string(), z.unknown())
    .refine((r) => Array.isArray(r['items']), { message: 'invalid_roadmap' }),
  message: z.string().max(200).optional().default(''),
});

export type SaveRoadmapBody = z.infer<typeof SaveRoadmapBodySchema>;
