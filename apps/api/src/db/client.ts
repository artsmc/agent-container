import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@iexcel/database/schema';

export type DbSchema = typeof schema;
export type DbClient = PostgresJsDatabase<DbSchema>;

/**
 * Creates a Drizzle ORM client backed by a postgres.js connection.
 *
 * @param url - PostgreSQL connection string
 * @returns Drizzle database client with full schema typing
 */
export function createDbClient(url: string): DbClient {
  const queryClient = postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 5,
  });

  return drizzle(queryClient, { schema });
}

// ---------------------------------------------------------------------------
// Lazy singleton for use within the app
// ---------------------------------------------------------------------------

let _db: DbClient | undefined;

/**
 * Returns the singleton database client.
 * Must be initialised by calling `initDb(url)` before first use.
 *
 * @throws Error if the database client has not been initialised
 */
export function getDb(): DbClient {
  if (!_db) {
    throw new Error(
      'Database client has not been initialised. Call initDb(url) first.'
    );
  }
  return _db;
}

/**
 * Initialises the singleton database client.
 * Intended to be called once during application startup.
 */
export function initDb(url: string): DbClient {
  _db = createDbClient(url);
  return _db;
}
