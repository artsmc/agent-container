/**
 * Database access layer for the oidc_clients table.
 * All queries use parameterized statements.
 */
import { getPool } from './index.js';
import type { OidcClient } from '../types.js';

/** Parse JSONB columns that come back as strings or arrays */
function parseClient(row: Record<string, unknown>): OidcClient {
  return {
    id: row.id as string,
    client_id: row.client_id as string,
    client_name: row.client_name as string,
    client_secret_hash: (row.client_secret_hash as string) ?? null,
    client_type: row.client_type as 'public' | 'confidential',
    grant_types: parseJsonbArray(row.grant_types),
    redirect_uris: parseJsonbArray(row.redirect_uris),
    scopes: parseJsonbArray(row.scopes),
    token_lifetime: row.token_lifetime as number,
    refresh_token_lifetime: row.refresh_token_lifetime as number,
    is_active: row.is_active as boolean,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function parseJsonbArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [];
    }
  }
  return [];
}

const CLIENT_COLUMNS = `id, client_id, client_name, client_secret_hash, client_type,
  grant_types, redirect_uris, scopes, token_lifetime, refresh_token_lifetime,
  is_active, created_at, updated_at`;

export async function getClientByClientId(clientId: string): Promise<OidcClient | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT ${CLIENT_COLUMNS} FROM oidc_clients WHERE client_id = $1`,
    [clientId]
  );
  if (result.rows.length === 0) return null;
  return parseClient(result.rows[0] as Record<string, unknown>);
}

export async function getClientById(id: string): Promise<OidcClient | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT ${CLIENT_COLUMNS} FROM oidc_clients WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return parseClient(result.rows[0] as Record<string, unknown>);
}

export async function listClients(): Promise<OidcClient[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT ${CLIENT_COLUMNS} FROM oidc_clients ORDER BY created_at ASC`
  );
  return result.rows.map((row) => parseClient(row as Record<string, unknown>));
}

export async function createClient(params: {
  clientId: string;
  clientName: string;
  clientSecretHash: string | null;
  clientType: 'public' | 'confidential';
  grantTypes: string[];
  redirectUris: string[];
  scopes: string[];
  tokenLifetime: number;
  refreshTokenLifetime: number;
}): Promise<OidcClient> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO oidc_clients (
      client_id, client_name, client_secret_hash, client_type,
      grant_types, redirect_uris, scopes, token_lifetime, refresh_token_lifetime
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING ${CLIENT_COLUMNS}`,
    [
      params.clientId,
      params.clientName,
      params.clientSecretHash,
      params.clientType,
      JSON.stringify(params.grantTypes),
      JSON.stringify(params.redirectUris),
      JSON.stringify(params.scopes),
      params.tokenLifetime,
      params.refreshTokenLifetime,
    ]
  );
  return parseClient(result.rows[0] as Record<string, unknown>);
}

export async function updateClient(
  id: string,
  updates: {
    clientName?: string;
    grantTypes?: string[];
    redirectUris?: string[];
    scopes?: string[];
    tokenLifetime?: number;
    refreshTokenLifetime?: number;
    isActive?: boolean;
  }
): Promise<OidcClient | null> {
  const setClauses: string[] = [];
  const values: (string | number | boolean)[] = [];
  let paramIndex = 1;

  if (updates.clientName !== undefined) {
    setClauses.push(`client_name = $${paramIndex}`);
    values.push(updates.clientName);
    paramIndex++;
  }
  if (updates.grantTypes !== undefined) {
    setClauses.push(`grant_types = $${paramIndex}`);
    values.push(JSON.stringify(updates.grantTypes));
    paramIndex++;
  }
  if (updates.redirectUris !== undefined) {
    setClauses.push(`redirect_uris = $${paramIndex}`);
    values.push(JSON.stringify(updates.redirectUris));
    paramIndex++;
  }
  if (updates.scopes !== undefined) {
    setClauses.push(`scopes = $${paramIndex}`);
    values.push(JSON.stringify(updates.scopes));
    paramIndex++;
  }
  if (updates.tokenLifetime !== undefined) {
    setClauses.push(`token_lifetime = $${paramIndex}`);
    values.push(updates.tokenLifetime);
    paramIndex++;
  }
  if (updates.refreshTokenLifetime !== undefined) {
    setClauses.push(`refresh_token_lifetime = $${paramIndex}`);
    values.push(updates.refreshTokenLifetime);
    paramIndex++;
  }
  if (updates.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex}`);
    values.push(updates.isActive);
    paramIndex++;
  }

  if (setClauses.length === 0) {
    return getClientById(id);
  }

  values.push(id);
  const result = await getPool().query(
    `UPDATE oidc_clients SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING ${CLIENT_COLUMNS}`,
    values
  );

  if (result.rows.length === 0) return null;
  return parseClient(result.rows[0] as Record<string, unknown>);
}

export async function setClientActive(id: string, isActive: boolean): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE oidc_clients SET is_active = $2, updated_at = NOW() WHERE id = $1`,
    [id, isActive]
  );
}

export async function updateClientSecretHash(
  id: string,
  secretHash: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE oidc_clients SET client_secret_hash = $2, updated_at = NOW() WHERE id = $1`,
    [id, secretHash]
  );
}
