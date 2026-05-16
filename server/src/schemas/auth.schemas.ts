import { z } from 'zod';

export const MagicLinkRequestSchema = z.object({
  email: z.string().trim().min(3, 'invalid_email').max(254).email('invalid_email'),
});

export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>;

export const CallbackQuerySchema = z.object({
  token: z.string().min(10).max(200),
});

export type CallbackQuery = z.infer<typeof CallbackQuerySchema>;
