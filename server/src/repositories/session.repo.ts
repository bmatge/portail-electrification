import type { Db } from '../db/client.js';

export interface SessionRow {
  readonly token: string;
  readonly user_id: number;
  readonly user_name: string;
}

export function findSessionByToken(db: Db, token: string): SessionRow | undefined {
  return db
    .prepare(
      `SELECT s.token, s.user_id, u.name AS user_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as SessionRow | undefined;
}

export function touchSession(db: Db, token: string): void {
  db.prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE token = ?`).run(token);
}

export function createSession(db: Db, token: string, userId: number): void {
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
