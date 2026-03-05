/**
 * Postgres connection pool for the auth database.
 */
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function createPool(connectionString: string): pg.Pool {
  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle Postgres client:', err.message);
  });

  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call createPool() first.');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
