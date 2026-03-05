/**
 * Status Reconciliation — Asana Task Status Merging
 *
 * Queries Postgres for tasks with status='pushed' for a given client,
 * fetches the live status of those tasks from Asana's API, and returns
 * a merged view (ReconciledTask[]) combining internal metadata with
 * live Asana completion data.
 *
 * This is a READ-ONLY function — it does not write to the tasks table.
 * The reconciled data is ephemeral, used only for agenda generation.
 *
 * Security invariants:
 * - Access tokens never appear in log output
 * - Task content (title, description) is never logged
 */

import { and, eq, sql } from 'drizzle-orm';
import { tasks, asanaWorkspaces } from '@iexcel/database/schema';
import type { DbClient } from '../../db/client';
import { fetchProjectTasks } from './asana-client';
import type { AsanaTaskItem } from './asana-client';
import {
  ReconciliationError,
  ProjectNotFoundError,
} from './reconciliation-error';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AsanaTaskStatus = 'completed' | 'incomplete' | 'not_found';

export interface AsanaCustomField {
  gid: string;
  name: string;
  display_value: string | null;
}

export interface ReconciledTask {
  // --- From Postgres (internal metadata) ---
  id: string;
  shortId: string;
  title: string;
  description: string;
  assignee: string | null;
  estimatedTime: string | null;
  scrumStage: string;
  transcriptId: string | null;
  asanaProjectId: string | null;
  asanaTaskId: string | null;
  pushedAt: Date | null;

  // --- From Asana (live status) ---
  asanaStatus: AsanaTaskStatus;
  asanaCompleted: boolean | null;
  asanaCompletedAt: string | null;
  asanaAssigneeName: string | null;
  asanaCustomFields: AsanaCustomField[];
}

// ---------------------------------------------------------------------------
// Logger interface (compatible with Pino and the module logger)
// ---------------------------------------------------------------------------

interface Logger {
  info(context: Record<string, unknown>, message: string): void;
  warn(context: Record<string, unknown>, message: string): void;
  debug(context: Record<string, unknown>, message: string): void;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PushedTaskRow {
  id: string;
  shortId: string;
  title: string;
  description: unknown;
  assignee: string | null;
  estimatedTime: string | null;
  scrumStage: string;
  transcriptId: string | null;
  asanaProjectId: string | null;
  asanaTaskId: string | null;
  asanaWorkspaceId: string | null;
  pushedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Database query — READ ONLY
// ---------------------------------------------------------------------------

async function queryPushedTasks(
  clientId: string,
  db: DbClient,
): Promise<PushedTaskRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      description: tasks.description,
      assignee: tasks.assignee,
      estimatedTime: tasks.estimatedTime,
      scrumStage: tasks.scrumStage,
      transcriptId: tasks.transcriptId,
      asanaProjectId: sql<string | null>`${tasks.externalRef}->>'projectId'`,
      asanaTaskId: sql<string | null>`${tasks.externalRef}->>'externalId'`,
      asanaWorkspaceId: sql<string | null>`${tasks.externalRef}->>'workspaceId'`,
      pushedAt: tasks.pushedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        eq(tasks.status, 'pushed'),
      ),
    );

  return rows as PushedTaskRow[];
}

// ---------------------------------------------------------------------------
// Access token resolution
// ---------------------------------------------------------------------------

async function resolveAccessTokenForWorkspace(
  workspaceGid: string,
  db: DbClient,
  log: Logger,
): Promise<string | null> {
  try {
    const rows = await db
      .select({
        accessTokenRef: asanaWorkspaces.accessTokenRef,
      })
      .from(asanaWorkspaces)
      .where(eq(asanaWorkspaces.asanaWorkspaceId, workspaceGid))
      .limit(1);

    const row = rows[0];
    if (!row) {
      log.warn(
        { workspaceGid },
        'Workspace not found in database — tasks will be unmatched',
      );
      return null;
    }

    return row.accessTokenRef;
  } catch {
    log.warn(
      { workspaceGid },
      'Failed to resolve access token — tasks will be unmatched',
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function buildUnmatchedReconciledTask(task: PushedTaskRow): ReconciledTask {
  return {
    id: task.id,
    shortId: task.shortId,
    title: task.title,
    description: descriptionToString(task.description),
    assignee: task.assignee,
    estimatedTime: task.estimatedTime,
    scrumStage: task.scrumStage ?? 'Backlog',
    transcriptId: task.transcriptId,
    asanaProjectId: task.asanaProjectId,
    asanaTaskId: task.asanaTaskId,
    pushedAt: task.pushedAt,
    asanaStatus: 'not_found',
    asanaCompleted: null,
    asanaCompletedAt: null,
    asanaAssigneeName: null,
    asanaCustomFields: [],
  };
}

function buildMatchedReconciledTask(
  task: PushedTaskRow,
  asanaTask: AsanaTaskItem,
): ReconciledTask {
  return {
    id: task.id,
    shortId: task.shortId,
    title: task.title,
    description: descriptionToString(task.description),
    assignee: task.assignee,
    estimatedTime: task.estimatedTime,
    scrumStage: task.scrumStage ?? 'Backlog',
    transcriptId: task.transcriptId,
    asanaProjectId: task.asanaProjectId,
    asanaTaskId: task.asanaTaskId,
    pushedAt: task.pushedAt,
    asanaStatus: asanaTask.completed ? 'completed' : 'incomplete',
    asanaCompleted: asanaTask.completed,
    asanaCompletedAt: asanaTask.completed_at,
    asanaAssigneeName: asanaTask.assignee?.name ?? null,
    asanaCustomFields: asanaTask.custom_fields.map((cf) => ({
      gid: cf.gid,
      name: cf.name,
      display_value: cf.display_value,
    })),
  };
}

/**
 * Converts the JSONB description to a string representation.
 * The description is stored as TaskDescription JSONB in the database.
 */
function descriptionToString(desc: unknown): string {
  if (typeof desc === 'string') return desc;
  if (desc === null || desc === undefined) return '';
  return JSON.stringify(desc);
}

// ---------------------------------------------------------------------------
// Main reconciliation orchestrator
// ---------------------------------------------------------------------------

/**
 * Reconciles pushed tasks for a given client with live Asana status.
 *
 * Steps:
 * 1. Query Postgres for all tasks with status='pushed' for the client.
 * 2. Deduplicate project GIDs from those tasks.
 * 3. For each unique project, resolve the access token and fetch all
 *    tasks from Asana, building a GID -> AsanaTaskItem map.
 * 4. For each pushed task, match against the map and build the
 *    merged ReconciledTask.
 *
 * @param clientId - UUID of the client to reconcile
 * @param db - Drizzle database client
 * @param log - Structured logger (Pino or compatible)
 * @returns Array of reconciled tasks merging Postgres + Asana data
 * @throws ReconciliationError on auth failures or exhausted retries
 */
export async function reconcileTasksForClient(
  clientId: string,
  db: DbClient,
  log: Logger,
): Promise<ReconciledTask[]> {
  const startMs = Date.now();

  // Step 1: Query Postgres for pushed tasks
  const pushedTasks = await queryPushedTasks(clientId, db);

  if (pushedTasks.length === 0) {
    log.info(
      { clientId, pushedTaskCount: 0, reconciledCount: 0, unmatchedCount: 0, durationMs: Date.now() - startMs },
      'Reconciliation completed',
    );
    return [];
  }

  // Step 2: Deduplicate project GIDs and resolve workspace mapping
  // Group by project GID, associating each with its workspace GID
  const projectWorkspaceMap = new Map<string, string>();
  for (const task of pushedTasks) {
    if (task.asanaProjectId && task.asanaWorkspaceId) {
      projectWorkspaceMap.set(task.asanaProjectId, task.asanaWorkspaceId);
    }
  }

  const uniqueProjectGids = [...projectWorkspaceMap.keys()];

  log.info(
    { clientId, pushedTaskCount: pushedTasks.length, uniqueProjectCount: uniqueProjectGids.length },
    'Reconciliation started',
  );

  // Step 3: Fetch tasks per project and build a GID -> AsanaTaskItem map
  const taskMap = new Map<string, AsanaTaskItem>();

  for (const projectGid of uniqueProjectGids) {
    const workspaceGid = projectWorkspaceMap.get(projectGid)!;
    const accessToken = await resolveAccessTokenForWorkspace(workspaceGid, db, log);
    if (!accessToken) {
      log.warn(
        { clientId, projectGid },
        'Could not resolve access token for project — tasks will be unmatched',
      );
      continue;
    }

    log.debug({ clientId, projectGid, page: 1 }, 'Project fetch started');

    try {
      const projectTasks = await fetchProjectTasks(projectGid, accessToken);
      for (const task of projectTasks) {
        taskMap.set(task.gid, task);
      }
      log.debug(
        { clientId, projectGid, totalTasksFetched: projectTasks.length },
        'Project fetch completed',
      );
    } catch (err) {
      if (err instanceof ReconciliationError && err.code === 'ASANA_AUTH_FAILED') {
        // Auth failures abort the entire reconciliation
        throw err;
      }
      if (err instanceof ProjectNotFoundError) {
        // 404: mark tasks for this project as not_found, continue
        log.warn(
          { clientId, projectGid },
          'Asana project not found (404) — tasks will be unmatched',
        );
        continue;
      }
      // All other errors (ASANA_UNAVAILABLE, ASANA_TIMEOUT) also abort
      throw err;
    }
  }

  // Step 4: Match and build ReconciledTask[]
  let unmatchedCount = 0;

  const result: ReconciledTask[] = pushedTasks.map((task) => {
    // Tasks with no project GID
    if (!task.asanaProjectId) {
      log.warn(
        { clientId, taskId: task.id, shortId: task.shortId, asanaTaskId: task.asanaTaskId, reason: 'missing_asana_project_id' },
        'Unmatched task',
      );
      unmatchedCount++;
      return buildUnmatchedReconciledTask(task);
    }

    // Tasks with no task GID
    if (!task.asanaTaskId) {
      log.warn(
        { clientId, taskId: task.id, shortId: task.shortId, asanaTaskId: null, reason: 'missing_asana_task_id' },
        'Unmatched task',
      );
      unmatchedCount++;
      return buildUnmatchedReconciledTask(task);
    }

    const asanaTask = taskMap.get(task.asanaTaskId);

    if (!asanaTask) {
      log.warn(
        { clientId, taskId: task.id, shortId: task.shortId, asanaTaskId: task.asanaTaskId, reason: 'task_not_in_project' },
        'Unmatched task',
      );
      unmatchedCount++;
      return buildUnmatchedReconciledTask(task);
    }

    return buildMatchedReconciledTask(task, asanaTask);
  });

  const durationMs = Date.now() - startMs;
  log.info(
    { clientId, reconciledCount: result.length - unmatchedCount, unmatchedCount, durationMs },
    'Reconciliation completed',
  );

  return result;
}
