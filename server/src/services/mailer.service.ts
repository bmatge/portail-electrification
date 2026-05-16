// Mailer pluggable. Quatre drivers :
// - memory : collecte les emails en RAM (tests + introspection)
// - console : log à stdout (dev sans SMTP)
// - smtp : nodemailer (production + Mailpit en dev)
// - noop : ne fait rien (utile pour bench)
//
// Le driver est sélectionné via la variable d'env MAILER_DRIVER (défaut
// 'console' en development, 'memory' en test, 'smtp' en production).

import { logger } from '../logger.js';

export interface MagicLinkEmail {
  readonly to: string;
  readonly token: string;
  readonly callbackUrl: string;
  readonly sentAt: string;
}

export interface Mailer {
  sendMagicLink(to: string, callbackUrl: string, token: string): Promise<void>;
  /** Pour les tests : liste des emails envoyés depuis le démarrage. */
  inbox(): readonly MagicLinkEmail[];
  /** Pour les tests : vide la boîte de réception. */
  clear(): void;
}

export function createMemoryMailer(): Mailer {
  const sent: MagicLinkEmail[] = [];
  return {
    async sendMagicLink(to, callbackUrl, token) {
      sent.push({ to, token, callbackUrl, sentAt: new Date().toISOString() });
    },
    inbox() {
      return sent;
    },
    clear() {
      sent.length = 0;
    },
  };
}

export function createConsoleMailer(): Mailer {
  const sent: MagicLinkEmail[] = [];
  return {
    async sendMagicLink(to, callbackUrl, token) {
      sent.push({ to, token, callbackUrl, sentAt: new Date().toISOString() });
      console.log(`[mailer/console] magic link → ${to}\n  ${callbackUrl}\n  (token=${token})`);
    },
    inbox() {
      return sent;
    },
    clear() {
      sent.length = 0;
    },
  };
}

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string;
  readonly pass?: string;
  readonly fromAddress: string;
  readonly fromName: string;
  readonly replyTo?: string;
}

export async function createSmtpMailer(config: SmtpConfig): Promise<Mailer> {
  // Lazy import : nodemailer n'est chargé qu'en prod ou en dev quand
  // MAILER_DRIVER=smtp explicitement (Mailpit). Ça garde le boot rapide
  // en mode console.
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  });
  const sent: MagicLinkEmail[] = [];
  const from = config.fromName ? `${config.fromName} <${config.fromAddress}>` : config.fromAddress;
  return {
    async sendMagicLink(to, callbackUrl, token) {
      try {
        await transport.sendMail({
          from,
          to,
          ...(config.replyTo ? { replyTo: config.replyTo } : {}),
          subject: "L'atelier 🪢 — votre lien de connexion",
          text:
            `Bonjour,\n\nVoici votre lien de connexion à L'atelier (valide ~15 minutes) :\n\n${callbackUrl}\n\n` +
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
          html:
            `<p>Bonjour,</p>` +
            `<p>Voici votre lien de connexion à <strong>L'atelier 🪢</strong> (valide ~15 minutes) :</p>` +
            `<p><a href="${escapeHtml(callbackUrl)}">${escapeHtml(callbackUrl)}</a></p>` +
            `<p style="color:#666;font-size:0.85rem">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
        });
        sent.push({ to, token, callbackUrl, sentAt: new Date().toISOString() });
      } catch (e) {
        logger.error(
          { err: e, to, host: config.host, port: config.port },
          'mailer/smtp send failed',
        );
        throw e;
      }
    },
    inbox() {
      return sent;
    },
    clear() {
      sent.length = 0;
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function createMailerFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<Mailer> {
  const driver = (env['MAILER_DRIVER'] ?? '').toLowerCase();
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const effective = driver || (nodeEnv === 'production' ? 'smtp' : 'console');
  switch (effective) {
    case 'memory':
      return createMemoryMailer();
    case 'console':
      return createConsoleMailer();
    case 'smtp': {
      const user = env['SMTP_USER'];
      const pass = env['SMTP_PASS'];
      const replyTo = env['SMTP_REPLY_TO'];
      return createSmtpMailer({
        host: env['SMTP_HOST'] ?? '127.0.0.1',
        port: Number(env['SMTP_PORT'] ?? 1025),
        secure: (env['SMTP_SECURE'] ?? 'false').toLowerCase() === 'true',
        fromAddress: env['SMTP_FROM'] ?? 'noreply@latelier.local',
        fromName: env['SMTP_FROM_NAME'] ?? "L'atelier",
        ...(user ? { user } : {}),
        ...(pass ? { pass } : {}),
        ...(replyTo ? { replyTo } : {}),
      });
    }
    default:
      logger.warn({ driver }, `unknown MAILER_DRIVER, falling back to console`);
      return createConsoleMailer();
  }
}
