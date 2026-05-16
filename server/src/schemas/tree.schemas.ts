import { z } from 'zod';

// Tree : forme laxiste en lecture (chaque nœud a au moins un `id` string),
// la normalisation des sous-champs est faite côté front. Le service vérifie
// `tree.id`, on évite ici une validation trop stricte qui casserait les
// révisions historiques (cf. plan de refacto, risque R5).
export const SaveTreeBodySchema = z.object({
  tree: z
    .record(z.string(), z.unknown())
    .refine((t) => typeof t['id'] === 'string' && (t['id'] as string).length > 0, {
      message: 'invalid_tree',
    }),
  message: z.string().max(200).optional().default(''),
});

export type SaveTreeBody = z.infer<typeof SaveTreeBodySchema>;
