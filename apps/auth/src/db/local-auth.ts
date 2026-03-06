/**
 * Database access layer for local authentication.
 * Queries for users with email/password credentials.
 */
import { getPool } from './index.js';
import type { User } from '../types.js';

export interface LocalUser extends User {
  password_hash: string | null;
  role: string;
}

export async function getUserByEmail(email: string): Promise<LocalUser | null> {
  const pool = getPool();
  const result = await pool.query<LocalUser>(
    `SELECT id, idp_subject, idp_provider, email, name, picture,
            is_active, created_at, updated_at, last_login_at,
            password_hash, role
     FROM users
     WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function createLocalUser(params: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<LocalUser> {
  const pool = getPool();
  const result = await pool.query<LocalUser>(
    `INSERT INTO users (idp_subject, idp_provider, email, name, password_hash, role)
     VALUES (gen_random_uuid()::text, 'local', $1, $2, $3, 'user')
     RETURNING id, idp_subject, idp_provider, email, name, picture,
               is_active, created_at, updated_at, last_login_at,
               password_hash, role`,
    [params.email, params.name, params.passwordHash]
  );
  return result.rows[0];
}

export async function getUserRoleById(userId: string): Promise<string> {
  const pool = getPool();
  const result = await pool.query<{ role: string }>(
    `SELECT COALESCE(role, 'user') as role FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.role ?? 'user';
}
