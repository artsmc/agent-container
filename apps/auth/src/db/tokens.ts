/**
 * Database access layer for the refresh_tokens table.
 * All queries use parameterized statements.
 */
import { getPool } from './index.js';
import type { RefreshTokenRow } from '../types.js';

export async function createRefreshToken(params: {
  userId: string;
  clientId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<RefreshTokenRow> {
  const pool = getPool();
  const result = await pool.query<RefreshTokenRow>(
    `INSERT INTO refresh_tokens (user_id, client_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, client_id, token_hash, expires_at, revoked_at, created_at`,
    [params.userId, params.clientId, params.tokenHash, params.expiresAt]
  );
  return result.rows[0];
}

export async function getRefreshTokenByHash(
  tokenHash: string
): Promise<RefreshTokenRow | null> {
  const pool = getPool();
  const result = await pool.query<RefreshTokenRow>(
    `SELECT id, user_id, client_id, token_hash, expires_at, revoked_at, created_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function revokeRefreshToken(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function revokeAllRefreshTokensForUserAndClient(
  userId: string,
  clientId: string
): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL`,
    [userId, clientId]
  );
  return result.rowCount ?? 0;
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return result.rowCount ?? 0;
}

export async function countActiveRefreshTokensForUser(userId: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM refresh_tokens
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function deleteExpiredAndRevokedRefreshTokens(): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM refresh_tokens
     WHERE (expires_at < NOW()) OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '1 hour')`
  );
  return result.rowCount ?? 0;
}
