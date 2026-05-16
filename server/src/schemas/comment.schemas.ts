import { z } from 'zod';

export const CreateCommentBodySchema = z.object({
  node_id: z.string().trim().min(1, 'node_id_required'),
  body: z.string().trim().min(1, 'body_required').max(4000, 'body_too_long'),
});

export type CreateCommentBody = z.infer<typeof CreateCommentBodySchema>;
