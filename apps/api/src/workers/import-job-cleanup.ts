/**
 * Import Job Cleanup (Feature 38)
 *
 * Detects and marks stuck import jobs as failed. A job is considered
 * stuck if it has been in 'in_progress' status for more than 30 minutes
 * with no progress update.
 *
 * This can be run periodically via a cron job or process timer.
 */

import { sql, and, eq, lt } from 'drizzle-orm';
import { importJobs } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';

const STUCK_JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Marks import jobs that have been in_progress for more than 30 minutes
 * as 'failed' with an appropriate error summary.
 *
 * Returns the number of jobs marked as failed.
 */
export async function cleanupStuckImportJobs(
  db: DbClient
): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS);

  const result = await db
    .update(importJobs)
    .set({
      status: 'failed',
      errorSummary: 'Import job timed out',
      completedAt: new Date(),
    })
    .where(
      and(
        eq(importJobs.status, 'in_progress'),
        lt(importJobs.startedAt, cutoff)
      )
    )
    .returning({ id: importJobs.id });

  if (result.length > 0) {
    console.warn(
      `[import-job-cleanup] Marked ${result.length} stuck import job(s) as failed:`,
      result.map((r) => r.id)
    );
  }

  return result.length;
}
