/**
 * Import Job Service
 *
 * Business logic layer for historical import jobs (Feature 38).
 * Handles validation, concurrency guard (one active job per client),
 * workspace resolution, and job creation.
 */

import { sql } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { ApiError, ForbiddenError, BusinessError } from '../errors/api-errors';
import { isValidUuid } from '../utils/short-id';
import { getClientById, writeAuditLog } from './client-service';
import {
  createImportJob,
  isJobInProgress,
  getImportJobById,
  getImportJobByIdForClient,
  getMostRecentJobForClient,
  getJobErrors,
  type ImportJobRow,
  type ImportJobErrorRow,
} from '../repositories/import-jobs-repository';
import { runImportJob } from '../workers/import-job-runner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriggerImportParams {
  clientId: string;
  userId: string;
  userRole: string;
  grainPlaylistId?: string;
  asanaProjectId?: string;
  asanaWorkspaceId?: string;
  reprocessTranscripts?: boolean;
  callTypeOverride?: string;
}

export interface ImportJobResponse {
  job_id: string;
  client_id: string;
  status: string;
  created_at: string;
}

export interface ImportStatusResponse {
  job_id: string;
  client_id: string;
  status: string;
  grain_playlist_id: string | null;
  asana_project_id: string | null;
  reprocess_transcripts: boolean;
  progress: {
    transcripts_imported: number;
    transcripts_total: number | null;
    tasks_imported: number;
    tasks_total: number | null;
    agendas_imported: number;
    agendas_total: number | null;
  };
  error_summary: string | null;
  error_details: ImportErrorRecord[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ImportErrorRecord {
  entity_type: string;
  source_id: string;
  error_code: string;
  error_message: string;
  occurred_at: string;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Triggers a historical import for a client.
 *
 * Validates inputs, checks for in-progress jobs (concurrency guard),
 * creates the import job record, enqueues the runner, and returns
 * the job response.
 */
export async function triggerImport(
  db: DbClient,
  params: TriggerImportParams
): Promise<ImportJobResponse> {
  const {
    clientId,
    userId,
    userRole,
    grainPlaylistId,
    asanaProjectId,
    asanaWorkspaceId,
    reprocessTranscripts,
    callTypeOverride,
  } = params;

  // 1. Role check: Team Members cannot trigger imports
  if (userRole === 'team_member') {
    throw new ForbiddenError('Team members cannot trigger historical imports');
  }

  // 2. Validate client ID
  if (!isValidUuid(clientId)) {
    throw new ApiError(400, 'INVALID_ID', 'The provided client ID is not a valid UUID.');
  }

  // 3. Client access check
  const client = await getClientById(db, clientId, userId, userRole);
  if (!client) {
    throw new ApiError(
      404,
      'CLIENT_NOT_FOUND',
      'The requested client does not exist or you do not have access to it.'
    );
  }

  // 4. At least one source is required
  if (!grainPlaylistId && !asanaProjectId) {
    throw new ApiError(
      400,
      'INVALID_BODY',
      'At least one source (grain_playlist_id or asana_project_id) must be provided'
    );
  }

  // 5. Validate grain_playlist_id if provided
  if (grainPlaylistId && grainPlaylistId.length > 500) {
    throw new ApiError(
      400,
      'INVALID_BODY',
      'grain_playlist_id must not exceed 500 characters'
    );
  }

  // 6. Resolve workspace if Asana project is provided
  let resolvedWorkspaceId = asanaWorkspaceId || null;
  if (asanaProjectId) {
    resolvedWorkspaceId =
      asanaWorkspaceId ||
      client.default_asana_workspace_id ||
      null;

    if (!resolvedWorkspaceId) {
      throw new BusinessError(
        422,
        'WORKSPACE_NOT_CONFIGURED',
        'Asana project specified but no workspace ID resolvable. Provide asana_workspace_id or configure default_asana_workspace_id on the client.',
        { client_id: clientId }
      );
    }
  }

  // 7. Concurrency guard: one active import per client
  const activeCheck = await isJobInProgress(db, clientId);
  if (activeCheck.inProgress) {
    throw new BusinessError(
      409,
      'IMPORT_IN_PROGRESS',
      'An import job for this client is already in progress.',
      { existing_job_id: activeCheck.existingJobId! }
    );
  }

  // 8. Create import job record
  const job = await createImportJob(db, {
    clientId,
    grainPlaylistId: grainPlaylistId || null,
    asanaProjectId: asanaProjectId || null,
    asanaWorkspaceId: resolvedWorkspaceId,
    reprocessTranscripts: reprocessTranscripts ?? false,
    callTypeOverride: callTypeOverride || null,
    createdBy: userId,
  });

  // 9. Write audit log
  await writeAuditLog(db, {
    userId,
    action: 'import.started',
    entityType: 'client',
    entityId: clientId,
    metadata: {
      job_id: job.id,
      grain_playlist_id: grainPlaylistId || null,
      asana_project_id: asanaProjectId || null,
      reprocess_transcripts: reprocessTranscripts ?? false,
    },
    source: 'ui',
  });

  // 10. Enqueue async job runner (fire-and-forget via setImmediate)
  // No existing job queue infrastructure (Feature 17 not yet done),
  // so we use in-process async execution.
  setImmediate(() => {
    runImportJob(db, job.id).catch((err) => {
      console.error(`[import-job-runner] Unhandled error for job ${job.id}:`, err);
    });
  });

  return {
    job_id: job.id,
    client_id: job.clientId,
    status: job.status,
    created_at: job.createdAt.toISOString(),
  };
}

/**
 * Gets the import status for a client.
 * If jobId is provided, returns that specific job.
 * Otherwise returns the most recent job.
 */
export async function getImportStatus(
  db: DbClient,
  clientId: string,
  userId: string,
  userRole: string,
  jobId?: string
): Promise<ImportStatusResponse> {
  // 1. Validate client ID
  if (!isValidUuid(clientId)) {
    throw new ApiError(400, 'INVALID_ID', 'The provided client ID is not a valid UUID.');
  }

  // 2. Client access check
  const client = await getClientById(db, clientId, userId, userRole);
  if (!client) {
    throw new ApiError(
      404,
      'CLIENT_NOT_FOUND',
      'The requested client does not exist or you do not have access to it.'
    );
  }

  // 3. Fetch the job
  let job: ImportJobRow | null;
  if (jobId) {
    if (!isValidUuid(jobId)) {
      throw new ApiError(400, 'INVALID_ID', 'The provided job_id is not a valid UUID.');
    }
    job = await getImportJobByIdForClient(db, jobId, clientId);
  } else {
    job = await getMostRecentJobForClient(db, clientId);
  }

  if (!job) {
    throw new ApiError(
      404,
      'IMPORT_JOB_NOT_FOUND',
      jobId
        ? `Import job '${jobId}' not found for this client.`
        : 'No import jobs found for this client.'
    );
  }

  // 4. Fetch error details (limited to 100)
  const errors = await getJobErrors(db, job.id, 100);

  return mapJobToStatusResponse(job, errors);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapJobToStatusResponse(
  job: ImportJobRow,
  errors: ImportJobErrorRow[]
): ImportStatusResponse {
  return {
    job_id: job.id,
    client_id: job.clientId,
    status: job.status,
    grain_playlist_id: job.grainPlaylistId,
    asana_project_id: job.asanaProjectId,
    reprocess_transcripts: job.reprocessTranscripts,
    progress: {
      transcripts_imported: job.transcriptsImported,
      transcripts_total: job.transcriptsTotal,
      tasks_imported: job.tasksImported,
      tasks_total: job.tasksTotal,
      agendas_imported: job.agendasImported,
      agendas_total: job.agendasTotal,
    },
    error_summary: job.errorSummary,
    error_details: errors.map((e) => ({
      entity_type: e.entityType,
      source_id: e.sourceId,
      error_code: e.errorCode,
      error_message: e.errorMessage,
      occurred_at: e.occurredAt.toISOString(),
    })),
    started_at: job.startedAt ? job.startedAt.toISOString() : null,
    completed_at: job.completedAt ? job.completedAt.toISOString() : null,
    created_at: job.createdAt.toISOString(),
  };
}
