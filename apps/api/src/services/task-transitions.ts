import { eq } from 'drizzle-orm';
import { tasks, clients } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import { ApiError, ForbiddenError, BusinessError } from '../errors/api-errors';
import { resolveTaskId } from '../utils/short-id';
import { getOutputNormalizer } from './output-normalizer';
import { getTaskDetail } from './task-service';
import {
  verifyClientAccess,
  writeAudit,
  resolveWorkspace,
  descriptionToString,
  intervalToHhmm,
} from './task-helpers';
import type {
  TaskDetailResponse,
  NormalizedTaskPayload,
  ExternalRefResponse,
} from './task-types';

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------

/**
 * Approves a single task.
 */
export async function approveTask(
  db: DbClient,
  taskIdParam: string,
  userId: string,
  userRole: string,
  source: 'agent' | 'ui' | 'terminal'
): Promise<TaskDetailResponse> {
  // Role check
  if (userRole !== 'account_manager' && userRole !== 'admin') {
    throw new ForbiddenError(
      'Only account managers and admins can approve tasks'
    );
  }

  const taskId = await resolveTaskId(taskIdParam, db);

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = taskRows[0];
  if (!task) {
    throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found');
  }

  const hasAccess = await verifyClientAccess(db, task.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this task');
  }

  if (task.status !== 'draft') {
    throw new BusinessError(
      422,
      'TASK_NOT_APPROVABLE',
      'Task can only be approved from draft status',
      { current_status: task.status }
    );
  }

  const now = new Date();
  await db
    .update(tasks)
    .set({
      status: 'approved',
      approvedBy: userId,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  await writeAudit(db, {
    userId,
    action: 'task.approved',
    entityType: 'task',
    entityId: taskId,
    metadata: {
      approved_by: userId,
      approved_at: now.toISOString(),
    },
    source,
  });

  const detail = await getTaskDetail(db, taskId);
  if (!detail) {
    throw new Error('Task not found after approval');
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

/**
 * Rejects a single task.
 */
export async function rejectTask(
  db: DbClient,
  taskIdParam: string,
  userId: string,
  userRole: string,
  reason: string | undefined,
  source: 'agent' | 'ui' | 'terminal'
): Promise<TaskDetailResponse> {
  const taskId = await resolveTaskId(taskIdParam, db);

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = taskRows[0];
  if (!task) {
    throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found');
  }

  const hasAccess = await verifyClientAccess(db, task.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this task');
  }

  if (task.status === 'pushed') {
    throw new BusinessError(
      422,
      'TASK_NOT_REJECTABLE',
      'Pushed tasks cannot be rejected',
      { current_status: task.status }
    );
  }

  const previousStatus = task.status;
  const now = new Date();

  await db
    .update(tasks)
    .set({
      status: 'rejected',
      approvedBy: null,
      approvedAt: null,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  await writeAudit(db, {
    userId,
    action: 'task.rejected',
    entityType: 'task',
    entityId: taskId,
    metadata: {
      previous_status: previousStatus,
      ...(reason ? { reason } : {}),
    },
    source,
  });

  const detail = await getTaskDetail(db, taskId);
  if (!detail) {
    throw new Error('Task not found after rejection');
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/**
 * Pushes a single task to the external PM system via the output normalizer.
 */
export async function pushTask(
  db: DbClient,
  taskIdParam: string,
  userId: string,
  userRole: string,
  source: 'agent' | 'ui' | 'terminal'
): Promise<TaskDetailResponse> {
  const taskId = await resolveTaskId(taskIdParam, db);

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = taskRows[0];
  if (!task) {
    throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found');
  }

  const hasAccess = await verifyClientAccess(db, task.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this task');
  }

  if (task.status !== 'approved') {
    throw new BusinessError(
      422,
      'TASK_NOT_PUSHABLE',
      'Only approved tasks can be pushed',
      { current_status: task.status }
    );
  }

  // Load client for workspace routing and client_name
  const clientRows = await db
    .select()
    .from(clients)
    .where(eq(clients.id, task.clientId))
    .limit(1);
  const client = clientRows[0];
  if (!client) {
    throw new ApiError(404, 'CLIENT_NOT_FOUND', 'Client not found');
  }

  const workspace = resolveWorkspace(
    task.externalRef,
    client.defaultAsanaWorkspaceId,
    client.defaultAsanaProjectId,
    taskId,
    task.clientId
  );

  const normalizedTask: NormalizedTaskPayload = {
    title: task.title,
    description: descriptionToString(task.description),
    assignee: task.assignee,
    estimated_time: intervalToHhmm(task.estimatedTime),
    scrum_stage: task.scrumStage,
    client_name: client.name,
  };

  let externalRef: ExternalRefResponse;
  try {
    const normalizer = getOutputNormalizer();
    externalRef = await normalizer.pushTask({
      task: normalizedTask,
      workspace,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown error from output normalizer';
    throw new BusinessError(502, 'PUSH_FAILED', 'Failed to push task to external system', {
      upstream_error: errorMessage,
    });
  }

  const now = new Date();
  await db
    .update(tasks)
    .set({
      status: 'pushed',
      externalRef: externalRef,
      pushedAt: now,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  await writeAudit(db, {
    userId,
    action: 'task.pushed',
    entityType: 'task',
    entityId: taskId,
    metadata: {
      external_ref: externalRef,
      pushed_at: now.toISOString(),
      workspace_id: workspace.workspaceId,
    },
    source,
  });

  const detail = await getTaskDetail(db, taskId);
  if (!detail) {
    throw new Error('Task not found after push');
  }
  return detail;
}
