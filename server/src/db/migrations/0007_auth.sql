-- Identités d'auth + tokens magic link.
-- `provider` accepte déjà 'proconnect' en prévision de v1.1 (OIDC).
-- `magic_link_tokens.token_hash` = sha256(token) ; on ne stocke jamais le
-- token en clair (vol de DB → attaquant ne peut pas se connecter).

CREATE TABLE IF NOT EXISTS auth_identities (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT    NOT NULL CHECK(provider IN ('local', 'proconnect')),
  provider_subject TEXT    NOT NULL,
  provider_data    TEXT,
  email_verified   INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  last_used_at     TEXT,
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token_hash             TEXT    PRIMARY KEY,
  email                  TEXT    NOT NULL,
  user_id                INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_ip           TEXT,
  user_agent             TEXT,
  expires_at             TEXT    NOT NULL,
  used_at                TEXT,
  consumed_by_session_id INTEGER,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_magic_link_email   ON magic_link_tokens(email);
CREATE INDEX IF NOT EXISTS idx_magic_link_expires ON magic_link_tokens(expires_at);
