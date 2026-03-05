import { sql } from 'drizzle-orm';
import type { DbClient } from './client';

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

export interface DatabaseHealthResult {
  status: 'ok' | 'error';
  message?: string;
}

/**
 * Runs a lightweight `SELECT 1` query with a 2-second timeout
 * to verify database connectivity.
 */
export async function checkDatabaseHealth(
  db: DbClient
): Promise<DatabaseHealthResult> {
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error('Database health check timed out')),
          HEALTH_CHECK_TIMEOUT_MS
        );
      }),
    ]);
    return { status: 'ok' };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown database error';
    return { status: 'error', message };
  }
}
