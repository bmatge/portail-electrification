// Mailer pluggable. Trois drivers :
// - memory : collecte les emails en RAM (tests + introspection)
// - console : log à stdout (dev sans SMTP)
// - smtp : nodemailer (à câbler en Phase 8 hardening — placeholder)
//
// Le driver est sélectionné via la variable d'env MAILER_DRIVER (défaut
// 'console' en development, 'memory' en test).

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
