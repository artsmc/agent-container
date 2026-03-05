/**
 * Import Job Runner (Feature 38)
 *
 * Asynchronous job execution for historical imports. Processes Grain
 * transcripts and Asana tasks in phases, with per-record error handling
 * and idempotency checks.
 *
 * Execution model: in-process async (no external job queue). Invoked
 * via setImmediate from the import service. When Feature 17 establishes
 * a proper job queue, this runner should be adapted to that pattern.
 */

import { eq, and, sql } from 'drizzle-orm';
import type { MeetingType, NormalizedTranscript } from '@iexcel/shared-types';
import { transcripts, tasks } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import {
  getImportJobById,
  updateJobStatus,
  setTranscriptsTotal,
  setTasksTotal,
  incrementTranscriptsImported,
  incrementTasksImported,
  addJobError,
} from '../repositories/import-jobs-repository';
import { writeAuditLog } from '../services/client-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_GRAIN_RECORDINGS = 500;
const MAX_ASANA_TASKS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AsanaTaskRecord {
  gid: string;
  name: string;
  notes?: string;
  assignee?: { name: string } | null;
  completed: boolean;
  completed_at?: string | null;
  created_at: string;
  permalink_url?: string;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * Runs the full import job lifecycle:
 *   1. Transition to in_progress
 *   2. Transcript import phase (if grain_playlist_id is set)
 *   3. Task import phase (if asana_project_id is set)
 *   4. Reprocessing phase (placeholder -- Feature 17 not done)
 *   5. Transition to completed or failed
 */
export async function runImportJob(
  db: DbClient,
  jobId: string
): Promise<void> {
  const job = await getImportJobById(db, jobId);
  if (!job) {
    console.error(`[import-job-runner] Job ${jobId} not found`);
    return;
  }

  // Abort if job is not in pending state (possible duplicate execution)
  if (job.status !== 'pending') {
    console.warn(
      `[import-job-runner] Job ${jobId} is in '${job.status}' state, skipping`
    );
    return;
  }

  let hasCatastrophicError = false;
  let errorSummary: string | undefined;

  try {
    // Transition: pending -> in_progress
    await updateJobStatus(db, jobId, 'in_progress');

    // Phase 2: Transcript import
    if (job.grainPlaylistId) {
      try {
        await runTranscriptPhase(db, jobId, job.clientId, {
          grainPlaylistId: job.grainPlaylistId,
          callTypeOverride: job.callTypeOverride,
        });
      } catch (err) {
        // Catastrophic failure in transcript phase
        hasCatastrophicError = true;
        errorSummary = `Transcript import failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[import-job-runner] Transcript phase catastrophic failure for job ${jobId}:`, err);
      }
    }

    // Phase 3: Task import (skip if catastrophic error)
    if (job.asanaProjectId && !hasCatastrophicError) {
      try {
        await runTaskPhase(db, jobId, job.clientId, {
          asanaProjectId: job.asanaProjectId,
          asanaWorkspaceId: job.asanaWorkspaceId!,
        });
      } catch (err) {
        hasCatastrophicError = true;
        errorSummary = `Task import failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[import-job-runner] Task phase catastrophic failure for job ${jobId}:`, err);
      }
    }

    // Phase 4: Reprocessing (TODO — Feature 17 not done)
    // When Feature 17 (Mastra workflow orchestration) is complete, add:
    // if (job.reprocessTranscripts && !hasCatastrophicError) {
    //   await runReprocessingPhase(db, jobId, job.clientId);
    // }

    // Final status
    const finalStatus = hasCatastrophicError ? 'failed' : 'completed';
    await updateJobStatus(db, jobId, finalStatus, { errorSummary });

    // Audit log
    await writeAuditLog(db, {
      userId: job.createdBy ?? job.clientId,
      action: hasCatastrophicError ? 'import.failed' : 'import.completed',
      entityType: 'client',
      entityId: job.clientId,
      metadata: {
        job_id: jobId,
        ...(errorSummary ? { error_summary: errorSummary } : {}),
      },
      source: 'ui',
    });
  } catch (err) {
    // Unexpected top-level error -- mark job as failed
    console.error(`[import-job-runner] Unexpected error for job ${jobId}:`, err);
    try {
      await updateJobStatus(db, jobId, 'failed', {
        errorSummary: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } catch {
      // Last resort -- can't even update the job status
      console.error(`[import-job-runner] Failed to update job ${jobId} to failed state`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase: Transcripts
// ---------------------------------------------------------------------------

interface TranscriptPhaseOptions {
  grainPlaylistId: string;
  callTypeOverride: string | null;
}

async function runTranscriptPhase(
  db: DbClient,
  jobId: string,
  clientId: string,
  options: TranscriptPhaseOptions
): Promise<void> {
  const { grainPlaylistId, callTypeOverride } = options;
  const callType = (callTypeOverride || 'client_call') as MeetingType;

  // Fetch recording IDs
  const recordingIds = await fetchGrainRecordingIds(grainPlaylistId);

  // Set total
  await setTranscriptsTotal(db, jobId, recordingIds.length);

  let consecutiveErrors = 0;
  const CATASTROPHIC_THRESHOLD = 5;

  for (const recordingId of recordingIds) {
    try {
      // Idempotency check
      const existing = await db
        .select({ id: transcripts.id })
        .from(transcripts)
        .where(
          and(
            eq(transcripts.clientId, clientId),
            eq(transcripts.grainCallId, recordingId),
            eq(transcripts.isImported, true)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Already imported — skip without error
        continue;
      }

      // Fetch and normalize via Grain normalizer
      let normalized: NormalizedTranscript;
      try {
        const { normalizeGrainTranscript } = await import(
          '../normalizers/grain/index'
        );
        normalized = await normalizeGrainTranscript({
          grainRecordingId: recordingId,
          callType,
          clientId,
        });
      } catch (grainErr) {
        // If Grain normalizer is not available, create minimal record
        const errMsg =
          grainErr instanceof Error ? grainErr.message : String(grainErr);

        // Check for catastrophic auth failures (401/403)
        if (
          errMsg.includes('Access denied') ||
          errMsg.includes('API key is not configured')
        ) {
          throw grainErr; // Bubble up as catastrophic
        }

        // Per-record error — log and continue
        await addJobError(db, {
          jobId,
          entityType: 'transcript',
          sourceId: recordingId,
          errorCode: 'GRAIN_IMPORT_ERROR',
          errorMessage: errMsg,
        });
        consecutiveErrors++;
        if (consecutiveErrors >= CATASTROPHIC_THRESHOLD) {
          throw new Error(
            `${CATASTROPHIC_THRESHOLD} consecutive Grain errors — aborting transcript phase`
          );
        }
        continue;
      }

      // Reset consecutive error counter on success
      consecutiveErrors = 0;

      // Build raw transcript text from segments
      const rawText = normalized.segments
        .map((s) => `${s.speaker}: ${s.text}`)
        .join('\n');

      // Insert transcript record
      await db.insert(transcripts).values({
        clientId,
        grainCallId: recordingId,
        callType,
        callDate: new Date(normalized.meetingDate),
        rawTranscript: rawText,
        normalizedSegments: normalized,
        processedAt: null,
        isImported: true,
        importedAt: new Date(),
        importSource: grainPlaylistId,
      });

      // Increment progress counter (atomic)
      await incrementTranscriptsImported(db, jobId);
    } catch (err) {
      // Re-throw catastrophic errors
      if (
        err instanceof Error &&
        (err.message.includes('Access denied') ||
          err.message.includes('API key is not configured') ||
          err.message.includes('consecutive Grain errors'))
      ) {
        throw err;
      }

      // Per-record error
      await addJobError(db, {
        jobId,
        entityType: 'transcript',
        sourceId: recordingId,
        errorCode: 'TRANSCRIPT_IMPORT_ERROR',
        errorMessage:
          err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Fetches recording IDs for a Grain playlist.
 *
 * Since the Grain API does not currently have a documented
 * "List Recordings by Playlist" endpoint, this function accepts
 * the playlist ID as a placeholder. When the Grain API adds
 * a list endpoint, only this function needs updating.
 *
 * For now, it returns an empty array with a console warning,
 * since we cannot list recordings by playlist ID without the
 * endpoint. The import must be triggered with grain_recording_ids
 * or the playlist must resolve to recordings in the future.
 *
 * TODO: Implement actual Grain playlist listing when the endpoint
 * becomes available. For demonstration, we return a stub that
 * could be replaced with real API calls.
 */
async function fetchGrainRecordingIds(
  grainPlaylistId: string
): Promise<string[]> {
  // Attempt dynamic resolution via Grain API if available
  try {
    const grainApiKey = process.env['GRAIN_API_KEY'];
    const baseUrl =
      process.env['GRAIN_API_BASE_URL'] ?? 'https://api.grain.com/v1';

    if (grainApiKey) {
      const response = await fetch(
        `${baseUrl}/playlists/${encodeURIComponent(grainPlaylistId)}/recordings`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${grainApiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          recordings?: Array<{ id: string }>;
        };
        if (data.recordings && Array.isArray(data.recordings)) {
          const ids = data.recordings
            .map((r) => r.id)
            .slice(0, MAX_GRAIN_RECORDINGS);
          if (data.recordings.length > MAX_GRAIN_RECORDINGS) {
            console.warn(
              `[import-job-runner] Grain playlist ${grainPlaylistId} has ${data.recordings.length} recordings, truncated to ${MAX_GRAIN_RECORDINGS}`
            );
          }
          return ids;
        }
      }

      // If endpoint returned 404, playlist listing not available
      if (response.status === 404) {
        console.warn(
          `[import-job-runner] Grain playlist listing endpoint not available (404). ` +
            `Playlist ID: ${grainPlaylistId}. No recordings will be imported.`
        );
        return [];
      }
    }
  } catch (err) {
    console.warn(
      `[import-job-runner] Could not fetch Grain playlist recordings: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return [];
}

// ---------------------------------------------------------------------------
// Phase: Tasks (Asana)
// ---------------------------------------------------------------------------

interface TaskPhaseOptions {
  asanaProjectId: string;
  asanaWorkspaceId: string;
}

async function runTaskPhase(
  db: DbClient,
  jobId: string,
  clientId: string,
  options: TaskPhaseOptions
): Promise<void> {
  const { asanaProjectId, asanaWorkspaceId } = options;

  // Fetch all tasks from Asana project
  const asanaTasks = await fetchAsanaTasks(asanaProjectId);

  // Set total
  await setTasksTotal(db, jobId, asanaTasks.length);

  let consecutiveErrors = 0;
  const CATASTROPHIC_THRESHOLD = 5;

  for (const asanaTask of asanaTasks) {
    try {
      // Idempotency check: external_ref->>'externalId' = asanaTask.gid
      const existing = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.clientId, clientId),
            sql`(${tasks.externalRef}->>'externalId') = ${asanaTask.gid}`,
            eq(tasks.isImported, true)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Already imported — skip
        continue;
      }

      // Reset consecutive errors on reaching the idempotency check
      consecutiveErrors = 0;

      // Map Asana status: completed=true -> 'completed', completed=false -> 'pushed'
      const taskStatus = asanaTask.completed ? 'completed' : 'pushed';

      // Build external_ref JSONB
      const externalRef = {
        system: 'asana',
        externalId: asanaTask.gid,
        externalUrl: asanaTask.permalink_url || null,
        workspaceId: asanaWorkspaceId,
        projectId: asanaProjectId,
      };

      // Get next short ID
      const shortIdResult = await db.execute(
        sql`SELECT next_task_short_id() AS short_id`
      );
      const shortId = (shortIdResult[0] as Record<string, string>)['short_id'];

      // Insert task record
      await db.insert(tasks).values({
        shortId,
        clientId,
        status: taskStatus as 'completed' | 'pushed',
        title: asanaTask.name || 'Untitled Asana Task',
        description: asanaTask.notes
          ? { taskContext: asanaTask.notes, additionalContext: '', requirements: [] }
          : null,
        assignee: asanaTask.assignee?.name || null,
        externalRef,
        isImported: true,
        importedAt: new Date(),
        importSource: asanaProjectId,
        createdAt: asanaTask.created_at
          ? new Date(asanaTask.created_at)
          : new Date(),
      });

      // Increment progress counter (atomic)
      await incrementTasksImported(db, jobId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Check for catastrophic auth failures
      if (
        errMsg.includes('401') ||
        errMsg.includes('403') ||
        errMsg.includes('Access denied')
      ) {
        throw err;
      }

      // Per-record error
      await addJobError(db, {
        jobId,
        entityType: 'task',
        sourceId: asanaTask.gid,
        errorCode: 'ASANA_TASK_IMPORT_ERROR',
        errorMessage: errMsg,
      });

      consecutiveErrors++;
      if (consecutiveErrors >= CATASTROPHIC_THRESHOLD) {
        throw new Error(
          `${CATASTROPHIC_THRESHOLD} consecutive Asana errors — aborting task phase`
        );
      }
    }
  }
}

/**
 * Fetches all tasks from an Asana project with pagination.
 *
 * Uses Asana REST API: GET /projects/{project_gid}/tasks
 * with opt_fields for the required fields.
 */
async function fetchAsanaTasks(
  asanaProjectId: string
): Promise<AsanaTaskRecord[]> {
  const accessToken = process.env['ASANA_ACCESS_TOKEN'];
  if (!accessToken) {
    throw new Error('Asana access token is not configured');
  }

  const baseUrl = 'https://app.asana.com/api/1.0';
  const optFields =
    'gid,name,notes,assignee.name,completed,completed_at,created_at,permalink_url';

  const allTasks: AsanaTaskRecord[] = [];
  let nextOffset: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 40; // Safety limit

  do {
    const url = new URL(`${baseUrl}/projects/${asanaProjectId}/tasks`);
    url.searchParams.set('opt_fields', optFields);
    url.searchParams.set('limit', '100');
    if (nextOffset) {
      url.searchParams.set('offset', nextOffset);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        throw new Error(`Asana API returned ${status}: Access denied`);
      }
      throw new Error(`Asana API returned HTTP ${status}`);
    }

    const data = (await response.json()) as {
      data: AsanaTaskRecord[];
      next_page?: { offset: string } | null;
    };

    if (data.data && Array.isArray(data.data)) {
      allTasks.push(...data.data);
    }

    nextOffset = data.next_page?.offset ?? null;
    pageCount++;

    if (allTasks.length >= MAX_ASANA_TASKS) {
      console.warn(
        `[import-job-runner] Asana project ${asanaProjectId} has more than ${MAX_ASANA_TASKS} tasks, truncating`
      );
      break;
    }
  } while (nextOffset && pageCount < MAX_PAGES);

  return allTasks.slice(0, MAX_ASANA_TASKS);
}
