import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared patterns
// ---------------------------------------------------------------------------

const ESTIMATED_TIME_PATTERN = /^\d{2,}:\d{2}$/;
const TASK_STATUSES = ['draft', 'approved', 'rejected', 'pushed'] as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Task description: accepts JSONB object or plain string
// ---------------------------------------------------------------------------

const taskDescriptionObjectSchema = z.object({
  taskContext: z.string(),
  additionalContext: z.string(),
  requirements: z.union([z.string(), z.array(z.string())]),
});

const taskDescriptionSchema = z.union([
  taskDescriptionObjectSchema,
  z.string().min(1, 'description must not be empty'),
]);

// ---------------------------------------------------------------------------
// POST /clients/{client_id}/tasks — Create draft tasks
// ---------------------------------------------------------------------------

const createTaskItemSchema = z.object({
  title: z
    .string()
    .min(1, 'title must not be empty')
    .max(500, 'title must be at most 500 characters'),
  description: taskDescriptionSchema,
  assignee: z.string().max(255).optional(),
  estimated_time: z
    .string()
    .regex(ESTIMATED_TIME_PATTERN, 'estimated_time must be in HH:MM format')
    .optional(),
  scrum_stage: z.string().max(100).optional(),
  asana_workspace_id: z.string().max(255).optional(),
  asana_project_id: z.string().max(255).optional(),
});

export const createTasksBodySchema = z.object({
  transcript_id: z
    .string()
    .regex(UUID_REGEX, 'transcript_id must be a valid UUID'),
  source: z.enum(['agent', 'ui', 'terminal']).optional().default('agent'),
  tasks: z
    .array(createTaskItemSchema)
    .min(1, 'At least one task is required')
    .max(50, 'Maximum 50 tasks per request'),
});

export type CreateTasksBody = z.infer<typeof createTasksBodySchema>;
export type CreateTaskItem = z.infer<typeof createTaskItemSchema>;

// ---------------------------------------------------------------------------
// GET /clients/{client_id}/tasks — List tasks query params
// ---------------------------------------------------------------------------

export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  transcript_id: z
    .string()
    .regex(UUID_REGEX, 'transcript_id must be a valid UUID')
    .optional(),
  page: z.coerce
    .number()
    .int('page must be an integer')
    .positive('page must be a positive integer')
    .default(1),
  per_page: z.coerce
    .number()
    .int('per_page must be an integer')
    .positive('per_page must be a positive integer')
    .max(100, 'per_page must not exceed 100')
    .default(20),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

// ---------------------------------------------------------------------------
// PATCH /tasks/{id} — Edit task
// ---------------------------------------------------------------------------

export const editTaskBodySchema = z
  .object({
    title: z
      .string()
      .min(1, 'title must not be empty')
      .max(500, 'title must be at most 500 characters'),
    description: taskDescriptionSchema,
    assignee: z.string().max(255),
    estimated_time: z
      .string()
      .regex(ESTIMATED_TIME_PATTERN, 'estimated_time must be in HH:MM format'),
    scrum_stage: z.string().max(100),
    asana_workspace_id: z.string().max(255),
    asana_project_id: z.string().max(255),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one editable field must be provided',
  });

export type EditTaskBody = z.infer<typeof editTaskBodySchema>;

// ---------------------------------------------------------------------------
// POST /tasks/{id}/reject — Reject task
// ---------------------------------------------------------------------------

export const rejectTaskBodySchema = z
  .object({
    reason: z.string().max(2000).optional(),
  })
  .optional()
  .default({});

export type RejectTaskBody = z.infer<typeof rejectTaskBodySchema>;

// ---------------------------------------------------------------------------
// Batch operations — POST /clients/{id}/tasks/approve or /push
// ---------------------------------------------------------------------------

export const batchTaskIdsBodySchema = z.object({
  task_ids: z
    .array(z.string().min(1))
    .min(1, 'At least one task_id is required')
    .max(50, 'Maximum 50 task_ids per request'),
});

export type BatchTaskIdsBody = z.infer<typeof batchTaskIdsBodySchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips non-editable fields from a raw PATCH body. This ensures that
 * even if the client sends status, short_id, etc., they are silently ignored.
 */
export function stripNonEditableFields(
  rawBody: Record<string, unknown>
): Record<string, unknown> {
  const NON_EDITABLE_KEYS = [
    'status',
    'short_id',
    'shortId',
    'client_id',
    'clientId',
    'transcript_id',
    'transcriptId',
    'approved_by',
    'approvedBy',
    'approved_at',
    'approvedAt',
    'pushed_at',
    'pushedAt',
    'id',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt',
    'external_ref',
    'externalRef',
  ];

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawBody)) {
    if (!NON_EDITABLE_KEYS.includes(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
