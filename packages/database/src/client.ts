/**
 * Database Client
 *
 * Exports a configured Drizzle ORM instance connected to the product
 * PostgreSQL database. The connection pool is sized for a single API
 * server instance (max 10 connections).
 *
 * Configuration is read from the DATABASE_URL environment variable.
 * See .env.example for the expected format.
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

const { Pool } = pg;

if (!process.env['DATABASE_URL']) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
    'See packages/database/.env.example for the expected format.'
  );
}

/**
 * Node-postgres connection pool.
 *
 * Pool settings:
 *   max: 10              — Maximum concurrent connections
 *   idleTimeoutMillis: 30000  — Close idle connections after 30 seconds
 *   connectionTimeoutMillis: 2000  — Fail fast if connection takes > 2 seconds
 */
export const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

/**
 * Drizzle ORM instance.
 *
 * Usage:
 *   import { db } from '@iexcel/database';
 *   const allClients = await db.select().from(schema.clients);
 */
export const db = drizzle(pool, { schema });

/**
 * Gracefully close all pool connections.
 * Call this during server shutdown.
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
