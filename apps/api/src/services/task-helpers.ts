import { and, eq } from 'drizzle-orm';
import {
  clientUsers,
  auditLog,
} from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import { BusinessError } from '../errors/api-errors';
import type {
  TaskSummaryResponse,
  TaskVersionResponse,
  ExternalRefResponse,
  WorkspaceConfig,
} from './task-types';

// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------

/**
 * Converts an HH:MM string to a PostgreSQL interval string.
 */
export function hhmmToInterval(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':');
  return `${hours} hours ${minutes} minutes`;
}

/**
 * Converts a PostgreSQL interval string back to HH:MM format.
 * Handles various Postgres interval representations.
 */
export function intervalToHhmm(interval: string | null): string | null {
  if (!interval) return null;

  // Handle format like "01:30:00" (Postgres shorthand)
  const timeMatch = interval.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    return `${timeMatch[1]}:${timeMatch[2]}`;
  }

  // Handle format like "1 hour 30 minutes" or "02:00:00"
  let totalMinutes = 0;

  const hourMatch = interval.match(/(\d+)\s*hour/i);
  if (hourMatch) totalMinutes += parseInt(hourMatch[1], 10) * 60;

  const minMatch = interval.match(/(\d+)\s*min/i);
  if (minMatch) totalMinutes += parseInt(minMatch[1], 10);

  if (totalMinutes === 0 && !hourMatch && !minMatch) {
    return interval;
  }

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Description normalization
// ---------------------------------------------------------------------------

export interface TaskDescriptionObject {
  taskContext: string;
  additionalContext: string;
  requirements: string | string[];
}

/**
 * Normalizes a description value to a TaskDescription JSONB object.
 */
export function normalizeDescription(
  desc: string | TaskDescriptionObject
): TaskDescriptionObject {
  if (typeof desc === 'string') {
    return {
      taskContext: desc,
      additionalContext: '',
      requirements: [],
    };
  }
  return desc;
}

/**
 * Converts a description JSONB to a flat string for the output normalizer.
 */
export function descriptionToString(desc: unknown): string {
  if (typeof desc === 'string') return desc;
  if (desc && typeof desc === 'object') {
    const d = desc as TaskDescriptionObject;
    const parts: string[] = [];
    if (d.taskContext) parts.push(`TASK CONTEXT:\n${d.taskContext}`);
    if (d.additionalContext) parts.push(`ADDITIONAL CONTEXT:\n${d.additionalContext}`);
    if (d.requirements) {
      const reqs = Array.isArray(d.requirements)
        ? d.requirements.join('\n- ')
        : d.requirements;
      parts.push(`REQUIREMENTS:\n- ${reqs}`);
    }
    return parts.join('\n\n');
  }
  return '';
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  shortId: string;
  clientId: string;
  transcriptId: string | null;
  status: string;
  title: string;
  description: unknown;
  assignee: string | null;
  estimatedTime: string | null;
  scrumStage: string;
  externalRef: unknown;
  approvedBy: string | null;
  approvedAt: Date | null;
  pushedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapTaskSummary(row: TaskRow): TaskSummaryResponse {
  return {
    id: row.id,
    short_id: row.shortId,
    client_id: row.clientId,
    transcript_id: row.transcriptId,
    status: row.status,
    title: row.title,
    description: row.description,
    assignee: row.assignee,
    estimated_time: intervalToHhmm(row.estimatedTime),
    scrum_stage: row.scrumStage,
    external_ref: (row.externalRef as ExternalRefResponse) ?? null,
    approved_by: row.approvedBy,
    approved_at: row.approvedAt?.toISOString() ?? null,
    pushed_at: row.pushedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export interface VersionRow {
  id: string;
  version: number;
  title: string;
  description: unknown;
  estimatedTime: string | null;
  editedBy: string | null;
  source: string;
  createdAt: Date;
}

export function mapTaskVersion(row: VersionRow): TaskVersionResponse {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    description: row.description,
    estimated_time: intervalToHhmm(row.estimatedTime),
    edited_by: row.editedBy,
    source: row.source,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Client access check
// ---------------------------------------------------------------------------

/**
 * Verifies that a user has access to a client.
 * Admins have access to all clients. Other users need a client_users record.
 */
export async function verifyClientAccess(
  db: DbClient,
  clientId: string,
  userId: string,
  role: string
): Promise<boolean> {
  if (role === 'admin') return true;

  const rows = await db
    .select({ clientId: clientUsers.clientId })
    .from(clientUsers)
    .where(
      and(eq(clientUsers.clientId, clientId), eq(clientUsers.userId, userId))
    )
    .limit(1);

  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Audit logging (non-blocking)
// ---------------------------------------------------------------------------

export async function writeAudit(
  db: DbClient,
  entry: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    source: 'agent' | 'ui' | 'terminal';
  }
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
      source: entry.source,
    });
  } catch (err) {
    // Audit log failure should not roll back the primary operation
    console.error('Failed to write audit log entry:', err);
  }
}

// ---------------------------------------------------------------------------
// Workspace routing
// ---------------------------------------------------------------------------

/**
 * Resolves workspace configuration using the routing cascade:
 * 1. Task-level externalRef workspaceId (pre-push config)
 * 2. Client default_asana_workspace_id
 * 3. Throw WORKSPACE_NOT_CONFIGURED
 */
export function resolveWorkspace(
  taskExternalRef: unknown,
  clientDefaultWorkspaceId: string | null,
  clientDefaultProjectId: string | null,
  taskId: string,
  clientId: string
): WorkspaceConfig {
  // Step 1: Check task-level workspace from externalRef (pre-push config)
  if (taskExternalRef && typeof taskExternalRef === 'object') {
    const ref = taskExternalRef as Record<string, unknown>;
    if (ref['workspaceId'] && typeof ref['workspaceId'] === 'string') {
      return {
        workspaceId: ref['workspaceId'],
        projectId: typeof ref['projectId'] === 'string' ? ref['projectId'] : null,
      };
    }
  }

  // Step 2: Client default
  if (clientDefaultWorkspaceId) {
    return {
      workspaceId: clientDefaultWorkspaceId,
      projectId: clientDefaultProjectId ?? null,
    };
  }

  // Step 3: No workspace configured
  throw new BusinessError(
    422,
    'WORKSPACE_NOT_CONFIGURED',
    'No workspace configured on task or client',
    { task_id: taskId, client_id: clientId }
  );
}

// ---------------------------------------------------------------------------
// Edit change tracking helper
// ---------------------------------------------------------------------------

export interface EditChangeResult {
  updateSet: Record<string, unknown>;
  changedFields: string[];
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

/**
 * Builds the update set and change tracking data for a task edit.
 * Returns the Drizzle update set and audit metadata.
 */
export function buildEditChanges(
  task: TaskRow,
  body: Record<string, unknown>,
  sqlFn: typeof import('drizzle-orm').sql
): EditChangeResult {
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const changedFields: string[] = [];

  const track = (field: string, dbField: string, prev: unknown, next: unknown, dbValue?: unknown) => {
    previousValues[field] = prev;
    newValues[field] = next;
    changedFields.push(field);
    updateSet[dbField] = dbValue ?? next;
  };

  if (body['title'] !== undefined) {
    track('title', 'title', task.title, body['title']);
  }
  if (body['description'] !== undefined) {
    const normalized = normalizeDescription(body['description'] as string | TaskDescriptionObject);
    track('description', 'description', task.description, normalized);
  }
  if (body['assignee'] !== undefined) {
    track('assignee', 'assignee', task.assignee, body['assignee']);
  }
  if (body['estimated_time'] !== undefined) {
    const et = body['estimated_time'] as string;
    track('estimated_time', 'estimatedTime',
      intervalToHhmm(task.estimatedTime), et,
      sqlFn`${hhmmToInterval(et)}::interval`);
  }
  if (body['scrum_stage'] !== undefined) {
    track('scrum_stage', 'scrumStage', task.scrumStage, body['scrum_stage']);
  }

  if (body['asana_workspace_id'] !== undefined || body['asana_project_id'] !== undefined) {
    const currentRef = (task.externalRef as ExternalRefResponse) ?? {
      system: 'asana', externalId: null, externalUrl: null,
      workspaceId: null, projectId: null,
    };
    const updatedRef = { ...currentRef };
    if (body['asana_workspace_id'] !== undefined) {
      changedFields.push('asana_workspace_id');
      updatedRef.workspaceId = body['asana_workspace_id'] as string;
    }
    if (body['asana_project_id'] !== undefined) {
      changedFields.push('asana_project_id');
      updatedRef.projectId = body['asana_project_id'] as string;
    }
    updateSet['externalRef'] = updatedRef;
  }

  return { updateSet, changedFields, previousValues, newValues };
}
