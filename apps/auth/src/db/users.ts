/**
 * Database access layer for the users table.
 * All queries use parameterized statements.
 */
import { getPool } from './index.js';
import type { User, ListUsersParams } from '../types.js';

export async function getUserByIdpSubject(
  idpSubject: string,
  idpProvider: string
): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query<User>(
    `SELECT id, idp_subject, idp_provider, email, name, picture,
            is_active, created_at, updated_at, last_login_at
     FROM users
     WHERE idp_subject = $1 AND idp_provider = $2`,
    [idpSubject, idpProvider]
  );
  return result.rows[0] ?? null;
}

export async function upsertUser(params: {
  idpSubject: string;
  idpProvider: string;
  email: string;
  name: string;
  picture: string | null;
}): Promise<User> {
  const pool = getPool();
  const result = await pool.query<User>(
    `INSERT INTO users (idp_subject, idp_provider, email, name, picture, last_login_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (idp_subject, idp_provider)
     DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       picture = EXCLUDED.picture,
       last_login_at = NOW(),
       updated_at = NOW()
     RETURNING id, idp_subject, idp_provider, email, name, picture,
               is_active, created_at, updated_at, last_login_at`,
    [params.idpSubject, params.idpProvider, params.email, params.name, params.picture]
  );
  return result.rows[0];
}

export async function getUserById(id: string): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query<User>(
    `SELECT id, idp_subject, idp_provider, email, name, picture,
            is_active, created_at, updated_at, last_login_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function setUserActive(id: string, isActive: boolean): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1`,
    [id, isActive]
  );
}

export async function listUsers(
  params: ListUsersParams
): Promise<{ users: User[]; total: number }> {
  const pool = getPool();
  const conditions: string[] = [];
  const values: (string | boolean | number)[] = [];
  let paramIndex = 1;

  if (params.isActive !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    values.push(params.isActive);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM users ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  values.push(params.limit);
  const limitParam = `$${paramIndex}`;
  paramIndex++;

  values.push(params.offset);
  const offsetParam = `$${paramIndex}`;

  const result = await pool.query<User>(
    `SELECT id, idp_subject, idp_provider, email, name, picture,
            is_active, created_at, updated_at, last_login_at
     FROM users
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    values
  );

  return { users: result.rows, total };
}
