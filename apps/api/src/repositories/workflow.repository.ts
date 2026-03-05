import { eq, and, sql, desc, inArray, count } from 'drizzle-orm';
import { workflowRuns, tasks } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import { NotFoundError } from '../errors/api-errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowRunRecord {
  id: string;
  workflowType: 'intake' | 'agenda';
  clientId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  inputRefs: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  triggeredBy: string | null;
  startedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreateWorkflowRunParams {
  workflowType: 'intake' | 'agenda';
  clientId: string;
  status: 'pending';
  inputRefs: Record<string, unknown>;
  triggeredBy: string | null;
}

export interface UpdateStatusParams {
  status: 'running' | 'completed' | 'failed';
  result?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  completedAt?: Date | null;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: typeof workflowRuns.$inferSelect): WorkflowRunRecord {
  return {
    id: row.id,
    workflowType: row.workflowType,
    clientId: row.clientId,
    status: row.status,
    inputRefs: (row.inputRefs ?? {}) as Record<string, unknown>,
    result: row.result as Record<string, unknown> | null,
    error: row.error as Record<string, unknown> | null,
    triggeredBy: row.triggeredBy,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

// ---------------------------------------------------------------------------
// Repository functions
// ---------------------------------------------------------------------------

/**
 * Inserts a new workflow run record.
 */
export async function createWorkflowRun(
  db: DbClient,
  params: CreateWorkflowRunParams
): Promise<WorkflowRunRecord> {
  const inserted = await db
    .insert(workflowRuns)
    .values({
      workflowType: params.workflowType,
      clientId: params.clientId,
      status: params.status,
      inputRefs: params.inputRefs,
      triggeredBy: params.triggeredBy,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error('Failed to insert workflow run');
  }

  return mapRow(row);
}

/**
 * Fetches a workflow run by ID.
 * Throws NotFoundError if not found.
 */
export async function findWorkflowRunByIdOrThrow(
  db: DbClient,
  id: string
): Promise<WorkflowRunRecord> {
  const rows = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new NotFoundError('WORKFLOW_RUN_NOT_FOUND');
  }

  return mapRow(row);
}

/**
 * Finds an active (pending or running) workflow run for a client and workflow type.
 * Returns null if none found.
 */
export async function findActiveRun(
  db: DbClient,
  clientId: string,
  workflowType: 'intake' | 'agenda'
): Promise<WorkflowRunRecord | null> {
  const rows = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.clientId, clientId),
        eq(workflowRuns.workflowType, workflowType),
        inArray(workflowRuns.status, ['pending', 'running'])
      )
    )
    .limit(1);

  const row = rows[0];
  return row ? mapRow(row) : null;
}

/**
 * Updates the status and optional fields of a workflow run.
 * Always sets updated_at to the current time.
 */
export async function updateWorkflowRunStatus(
  db: DbClient,
  id: string,
  params: UpdateStatusParams
): Promise<WorkflowRunRecord> {
  const updateData: Record<string, unknown> = {
    status: params.status,
    updatedAt: new Date(),
  };

  if (params.result !== undefined) {
    updateData['result'] = params.result;
  }
  if (params.error !== undefined) {
    updateData['error'] = params.error;
  }
  if (params.completedAt !== undefined) {
    updateData['completedAt'] = params.completedAt;
  }

  const updated = await db
    .update(workflowRuns)
    .set(updateData)
    .where(eq(workflowRuns.id, id))
    .returning();

  const row = updated[0];
  if (!row) {
    throw new NotFoundError('WORKFLOW_RUN_NOT_FOUND');
  }

  return mapRow(row);
}

/**
 * Finds the most recently completed workflow run for a client and workflow type.
 * Returns null if none exist.
 */
export async function findLastCompletedRun(
  db: DbClient,
  clientId: string,
  workflowType: 'intake' | 'agenda'
): Promise<WorkflowRunRecord | null> {
  const rows = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.clientId, clientId),
        eq(workflowRuns.workflowType, workflowType),
        eq(workflowRuns.status, 'completed')
      )
    )
    .orderBy(desc(workflowRuns.completedAt))
    .limit(1);

  const row = rows[0];
  return row ? mapRow(row) : null;
}

/**
 * Counts tasks with status 'completed' for a client within a date range.
 * Used by the agenda workflow to verify that completed tasks exist before
 * triggering agenda generation.
 */
export async function countCompletedTasks(
  db: DbClient,
  clientId: string,
  cycleStart: string,
  cycleEnd: string
): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        eq(tasks.status, 'completed'),
        sql`${tasks.updatedAt} >= ${cycleStart}::date`,
        sql`${tasks.updatedAt} < (${cycleEnd}::date + INTERVAL '1 day')`
      )
    );

  return result[0]?.count ?? 0;
}
