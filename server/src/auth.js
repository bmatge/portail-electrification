import { randomBytes } from 'node:crypto';
import { db } from './db.js';

const COOKIE = 'pe_session';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
};

function cookieOpts(req) {
  return { ...COOKIE_OPTS, secure: req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' };
}

const upsertUser = db.prepare(`
  INSERT INTO users (name) VALUES (?)
  ON CONFLICT(name) DO UPDATE SET name = excluded.name
  RETURNING id, name
`);

const insertSession = db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)');
const getSession = db.prepare(`
  SELECT s.token, s.user_id, u.name AS user_name
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
`);
const touchSession = db.prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE token = ?`);
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');

export function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    const sess = getSession.get(token);
    if (sess) {
      touchSession.run(token);
      req.user = { id: sess.user_id, name: sess.user_name };
      req.sessionToken = token;
    }
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'identification_required' });
  next();
}

export function identifyRoute(req, res) {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (name.length > 60) return res.status(400).json({ error: 'name_too_long' });

  const user = upsertUser.get(name);
  const token = randomBytes(32).toString('hex');
  insertSession.run(token, user.id);
  res.cookie(COOKIE, token, cookieOpts(req));
  res.json({ user });
}

export function logoutRoute(req, res) {
  if (req.sessionToken) deleteSession.run(req.sessionToken);
  res.clearCookie(COOKIE, { path: '/' });
  res.status(204).end();
}

export function meRoute(req, res) {
  if (!req.user) return res.status(401).json({ error: 'identification_required' });
  res.json({ user: req.user });
}
