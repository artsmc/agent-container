import { eq, sql, and, count, desc, asc } from 'drizzle-orm';
import {
  tasks,
  taskVersions,
  transcripts,
} from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import { ApiError, ForbiddenError, BusinessError } from '../errors/api-errors';
import { resolveTaskId } from '../utils/short-id';
import {
  hhmmToInterval,
  normalizeDescription,
  mapTaskSummary,
  mapTaskVersion,
  verifyClientAccess,
  writeAudit,
  buildEditChanges,
  type TaskRow,
  type VersionRow,
} from './task-helpers';
import type {
  TaskSummaryResponse,
  TaskDetailResponse,
  ExternalRefResponse,
} from './task-types';
import type { CreateTasksBody, EditTaskBody } from '../validators/task-validators';

// Re-export for route handlers
export { verifyClientAccess } from './task-helpers';
export { approveTask, rejectTask, pushTask } from './task-transitions';
export { batchApprove, batchPush } from './task-batch';
export type {
  TaskSummaryResponse,
  TaskDetailResponse,
  BatchOperationResponse,
} from './task-types';

// ---------------------------------------------------------------------------
// Create draft tasks
// ---------------------------------------------------------------------------

/**
 * Creates draft tasks for a client.
 */
export async function createTasks(
  db: DbClient,
  clientId: string,
  userId: string,
  body: CreateTasksBody,
  source: 'agent' | 'ui' | 'terminal'
): Promise<TaskSummaryResponse[]> {
  // Verify transcript belongs to this client
  const transcriptRows = await db
    .select({ id: transcripts.id, clientId: transcripts.clientId })
    .from(transcripts)
    .where(eq(transcripts.id, body.transcript_id))
    .limit(1);

  const transcript = transcriptRows[0];
  if (!transcript) {
    throw new BusinessError(
      422,
      'TRANSCRIPT_NOT_FOUND',
      `Transcript '${body.transcript_id}' not found`,
      { transcript_id: body.transcript_id }
    );
  }
  if (transcript.clientId !== clientId) {
    throw new BusinessError(
      422,
      'TRANSCRIPT_NOT_FOUND',
      `Transcript '${body.transcript_id}' does not belong to this client`,
      { transcript_id: body.transcript_id, client_id: clientId }
    );
  }

  const effectiveSource = body.source ?? source;
  const createdTasks: TaskSummaryResponse[] = [];

  for (const taskItem of body.tasks) {
    const description = normalizeDescription(taskItem.description);

    // Build external_ref for workspace routing if provided
    let externalRef: ExternalRefResponse | null = null;
    if (taskItem.asana_workspace_id) {
      externalRef = {
        system: 'asana',
        externalId: null,
        externalUrl: null,
        workspaceId: taskItem.asana_workspace_id,
        projectId: taskItem.asana_project_id ?? null,
      };
    }

    // Get next short ID using the database function
    const shortIdResult = await db.execute(
      sql`SELECT next_task_short_id() AS short_id`
    );
    const shortId = (shortIdResult[0] as Record<string, string>)['short_id'];

    // Insert task
    const insertedRows = await db
      .insert(tasks)
      .values({
        shortId: shortId,
        clientId: clientId,
        transcriptId: body.transcript_id,
        status: 'draft',
        title: taskItem.title,
        description: description,
        assignee: taskItem.assignee ?? null,
        estimatedTime: taskItem.estimated_time
          ? sql`${hhmmToInterval(taskItem.estimated_time)}::interval`
          : null,
        scrumStage: taskItem.scrum_stage ?? 'Backlog',
        externalRef: externalRef,
      })
      .returning();

    const inserted = insertedRows[0];
    if (!inserted) {
      throw new Error('Failed to insert task');
    }

    // Insert initial version (version 1)
    await db.insert(taskVersions).values({
      taskId: inserted.id,
      version: 1,
      title: taskItem.title,
      description: description,
      estimatedTime: taskItem.estimated_time
        ? sql`${hhmmToInterval(taskItem.estimated_time)}::interval`
        : null,
      editedBy: userId,
      source: effectiveSource,
    });

    // Write audit log
    await writeAudit(db, {
      userId,
      action: 'task.created',
      entityType: 'task',
      entityId: inserted.id,
      metadata: {
        short_id: shortId,
        transcript_id: body.transcript_id,
        source: effectiveSource,
        client_id: clientId,
      },
      source: effectiveSource,
    });

    createdTasks.push(mapTaskSummary(inserted as TaskRow));
  }

  return createdTasks;
}

// ---------------------------------------------------------------------------
// List tasks
// ---------------------------------------------------------------------------

/**
 * Lists tasks for a client with optional filters and pagination.
 */
export async function listTasks(
  db: DbClient,
  clientId: string,
  filters: {
    status?: string;
    transcript_id?: string;
  },
  page: number,
  perPage: number
): Promise<{ data: TaskSummaryResponse[]; total: number }> {
  const offset = (page - 1) * perPage;

  const conditions = [eq(tasks.clientId, clientId)];
  if (filters.status) {
    conditions.push(
      sql`${tasks.status} = ${filters.status}` as ReturnType<typeof eq>
    );
  }
  if (filters.transcript_id) {
    conditions.push(eq(tasks.transcriptId, filters.transcript_id));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(whereClause)
      .orderBy(desc(tasks.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: count() }).from(tasks).where(whereClause),
  ]);

  return {
    data: rows.map((r) => mapTaskSummary(r as TaskRow)),
    total: totalResult[0]?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Get task detail
// ---------------------------------------------------------------------------

/**
 * Gets a task detail by its resolved UUID, including all versions.
 */
export async function getTaskDetail(
  db: DbClient,
  taskId: string
): Promise<TaskDetailResponse | null> {
  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  const task = taskRows[0];
  if (!task) return null;

  const versions = await db
    .select()
    .from(taskVersions)
    .where(eq(taskVersions.taskId, taskId))
    .orderBy(asc(taskVersions.version));

  return {
    ...mapTaskSummary(task as TaskRow),
    versions: versions.map((v) => mapTaskVersion(v as VersionRow)),
  };
}

// ---------------------------------------------------------------------------
// Edit task
// ---------------------------------------------------------------------------

/**
 * Edits a task: validates status, updates fields, creates a new version,
 * and writes an audit entry.
 */
export async function editTask(
  db: DbClient,
  taskIdParam: string,
  userId: string,
  userRole: string,
  body: EditTaskBody,
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

  // Read-only enforcement for imported records (Feature 38)
  if (task.isImported) {
    throw new BusinessError(422, 'IMPORT_RECORD_READ_ONLY', 'This record is a historical import and cannot be modified.', {
      entity_type: 'task',
      entity_id: task.shortId,
    });
  }

  if (task.status === 'pushed' || task.status === 'completed') {
    throw new BusinessError(422, 'TASK_NOT_EDITABLE', 'Task cannot be edited after it has been pushed', {
      current_status: task.status,
    });
  }

  // Build update set and track changes for audit
  const { updateSet, changedFields, previousValues, newValues } =
    buildEditChanges(task as TaskRow, body as Record<string, unknown>, sql);

  await db.update(tasks).set(updateSet).where(eq(tasks.id, taskId));

  // Get next version number
  const maxVersionResult = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(${taskVersions.version}), 0)` })
    .from(taskVersions)
    .where(eq(taskVersions.taskId, taskId));
  const nextVersion = (maxVersionResult[0]?.maxVersion ?? 0) + 1;

  // Fetch updated task for version snapshot
  const updatedTaskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  const updatedTask = updatedTaskRows[0];
  if (!updatedTask) throw new Error('Task disappeared after update');

  // Insert version record
  await db.insert(taskVersions).values({
    taskId: taskId,
    version: nextVersion,
    title: updatedTask.title,
    description: updatedTask.description,
    estimatedTime: updatedTask.estimatedTime
      ? sql`${updatedTask.estimatedTime}::interval`
      : null,
    editedBy: userId,
    source: source,
  });

  await writeAudit(db, {
    userId,
    action: 'task.edited',
    entityType: 'task',
    entityId: taskId,
    metadata: {
      version: nextVersion,
      changed_fields: changedFields,
      previous_values: previousValues,
      new_values: newValues,
    },
    source: source,
  });

  const detail = await getTaskDetail(db, taskId);
  if (!detail) throw new Error('Task not found after edit');
  return detail;
}
