/**
 * Database access layer for the sessions table.
 * All queries use parameterized statements.
 */
import { getPool } from './index.js';
import type { SessionRow } from '../types.js';

export async function createSession(params: {
  userId: string;
  idpSessionId: string | null;
  expiresAt: Date;
}): Promise<SessionRow> {
  const pool = getPool();
  const result = await pool.query<SessionRow>(
    `INSERT INTO sessions (user_id, idp_session_id, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, idp_session_id, expires_at, created_at`,
    [params.userId, params.idpSessionId, params.expiresAt]
  );
  return result.rows[0];
}

export async function getSessionById(id: string): Promise<SessionRow | null> {
  const pool = getPool();
  const result = await pool.query<SessionRow>(
    `SELECT id, user_id, idp_session_id, expires_at, created_at
     FROM sessions
     WHERE id = $1 AND expires_at > NOW()`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function deleteSessionsByUserId(userId: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM sessions WHERE user_id = $1`,
    [userId]
  );
  return result.rowCount ?? 0;
}

export async function deleteSessionById(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
}

export async function countActiveSessionsForUser(userId: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM sessions
     WHERE user_id = $1 AND expires_at > NOW()`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function deleteExpiredSessions(): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM sessions WHERE expires_at < NOW()`
  );
  return result.rowCount ?? 0;
}
