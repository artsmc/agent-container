/**
 * Import Jobs Repository
 *
 * Database access layer for import_jobs and import_job_errors tables.
 * All counter increments use atomic SQL (SET col = col + 1) to support
 * concurrent per-record updates from the job runner.
 */

import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { importJobs, importJobErrors } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateImportJobParams {
  clientId: string;
  grainPlaylistId?: string | null;
  asanaProjectId?: string | null;
  asanaWorkspaceId?: string | null;
  reprocessTranscripts?: boolean;
  callTypeOverride?: string | null;
  createdBy: string;
}

export interface ImportJobRow {
  id: string;
  clientId: string;
  status: string;
  grainPlaylistId: string | null;
  asanaProjectId: string | null;
  asanaWorkspaceId: string | null;
  reprocessTranscripts: boolean;
  callTypeOverride: string | null;
  transcriptsTotal: number | null;
  transcriptsImported: number;
  tasksTotal: number | null;
  tasksImported: number;
  agendasTotal: number | null;
  agendasImported: number;
  errorSummary: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface ImportJobErrorRow {
  id: string;
  jobId: string;
  entityType: string;
  sourceId: string;
  errorCode: string;
  errorMessage: string;
  occurredAt: Date;
}

export interface AddJobErrorParams {
  jobId: string;
  entityType: 'transcript' | 'task' | 'agenda';
  sourceId: string;
  errorCode: string;
  errorMessage: string;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Creates a new import job in 'pending' status.
 */
export async function createImportJob(
  db: DbClient,
  params: CreateImportJobParams
): Promise<ImportJobRow> {
  const rows = await db
    .insert(importJobs)
    .values({
      clientId: params.clientId,
      grainPlaylistId: params.grainPlaylistId ?? null,
      asanaProjectId: params.asanaProjectId ?? null,
      asanaWorkspaceId: params.asanaWorkspaceId ?? null,
      reprocessTranscripts: params.reprocessTranscripts ?? false,
      callTypeOverride: params.callTypeOverride ?? null,
      createdBy: params.createdBy,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to insert import job');
  }
  return row as ImportJobRow;
}

/**
 * Gets an import job by its ID.
 */
export async function getImportJobById(
  db: DbClient,
  jobId: string
): Promise<ImportJobRow | null> {
  const rows = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.id, jobId))
    .limit(1);

  const row = rows[0];
  return row ? (row as ImportJobRow) : null;
}

/**
 * Gets an import job by ID scoped to a specific client.
 */
export async function getImportJobByIdForClient(
  db: DbClient,
  jobId: string,
  clientId: string
): Promise<ImportJobRow | null> {
  const rows = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.clientId, clientId)))
    .limit(1);

  const row = rows[0];
  return row ? (row as ImportJobRow) : null;
}

/**
 * Gets the most recent import job for a client (ordered by created_at DESC).
 */
export async function getMostRecentJobForClient(
  db: DbClient,
  clientId: string
): Promise<ImportJobRow | null> {
  const rows = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.clientId, clientId))
    .orderBy(desc(importJobs.createdAt))
    .limit(1);

  const row = rows[0];
  return row ? (row as ImportJobRow) : null;
}

/**
 * Checks if an import job is currently in_progress for a given client.
 * Uses the partial index on status IN ('pending', 'in_progress').
 */
export async function isJobInProgress(
  db: DbClient,
  clientId: string
): Promise<{ inProgress: boolean; existingJobId?: string }> {
  const rows = await db
    .select({ id: importJobs.id })
    .from(importJobs)
    .where(
      and(
        eq(importJobs.clientId, clientId),
        inArray(importJobs.status, ['pending', 'in_progress'])
      )
    )
    .limit(1);

  const row = rows[0];
  return row
    ? { inProgress: true, existingJobId: row.id }
    : { inProgress: false };
}

/**
 * Updates the status of an import job.
 * Optionally sets startedAt/completedAt/errorSummary based on the new status.
 */
export async function updateJobStatus(
  db: DbClient,
  jobId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  opts?: { errorSummary?: string }
): Promise<void> {
  const updateSet: Record<string, unknown> = { status };

  if (status === 'in_progress') {
    updateSet['startedAt'] = new Date();
  }

  if (status === 'completed' || status === 'failed') {
    updateSet['completedAt'] = new Date();
  }

  if (opts?.errorSummary !== undefined) {
    updateSet['errorSummary'] = opts.errorSummary;
  }

  await db
    .update(importJobs)
    .set(updateSet)
    .where(eq(importJobs.id, jobId));
}

/**
 * Sets the total count for transcripts on the job.
 */
export async function setTranscriptsTotal(
  db: DbClient,
  jobId: string,
  total: number
): Promise<void> {
  await db
    .update(importJobs)
    .set({ transcriptsTotal: total })
    .where(eq(importJobs.id, jobId));
}

/**
 * Sets the total count for tasks on the job.
 */
export async function setTasksTotal(
  db: DbClient,
  jobId: string,
  total: number
): Promise<void> {
  await db
    .update(importJobs)
    .set({ tasksTotal: total })
    .where(eq(importJobs.id, jobId));
}

/**
 * Atomically increments the transcripts_imported counter by 1.
 */
export async function incrementTranscriptsImported(
  db: DbClient,
  jobId: string
): Promise<void> {
  await db
    .update(importJobs)
    .set({
      transcriptsImported: sql`${importJobs.transcriptsImported} + 1`,
    })
    .where(eq(importJobs.id, jobId));
}

/**
 * Atomically increments the tasks_imported counter by 1.
 */
export async function incrementTasksImported(
  db: DbClient,
  jobId: string
): Promise<void> {
  await db
    .update(importJobs)
    .set({
      tasksImported: sql`${importJobs.tasksImported} + 1`,
    })
    .where(eq(importJobs.id, jobId));
}

/**
 * Inserts a per-record error into the import_job_errors table.
 */
export async function addJobError(
  db: DbClient,
  params: AddJobErrorParams
): Promise<void> {
  await db.insert(importJobErrors).values({
    jobId: params.jobId,
    entityType: params.entityType,
    sourceId: params.sourceId,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
  });
}

/**
 * Gets error records for an import job, limited to the most recent entries.
 */
export async function getJobErrors(
  db: DbClient,
  jobId: string,
  limit = 100
): Promise<ImportJobErrorRow[]> {
  const rows = await db
    .select()
    .from(importJobErrors)
    .where(eq(importJobErrors.jobId, jobId))
    .orderBy(desc(importJobErrors.occurredAt))
    .limit(limit);

  return rows as ImportJobErrorRow[];
}

/**
 * Counts total errors for a given job.
 */
export async function countJobErrors(
  db: DbClient,
  jobId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(importJobErrors)
    .where(eq(importJobErrors.jobId, jobId));

  return result[0]?.count ?? 0;
}
