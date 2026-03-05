/**
 * @iexcel/database
 *
 * Product database package for the iExcel automation system.
 * Exports the Drizzle ORM schema, database client, and type utilities.
 *
 * Usage:
 *   import { db, schema } from '@iexcel/database';
 *   import { users, tasks, clients } from '@iexcel/database/schema';
 *   import { db, closePool } from '@iexcel/database/client';
 */

// Schema — all table definitions, enums, indexes, and relations
export * from './schema';

// Client — database connection pool and Drizzle instance
export { db, pool, closePool } from './client';
