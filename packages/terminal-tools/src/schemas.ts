/**
 * Zod input schemas for all 10 MCP tool inputs.
 *
 * These schemas provide terminal-side validation before forwarding
 * requests to the Mastra MCP server. Short IDs use the 3+ digit
 * uncapped format (TSK-001, TSK-12345, AGD-001, AGD-12345).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

/** Matches TSK- followed by 3 or more digits (uncapped). */
export const shortTaskId = z
  .string()
  .regex(/^TSK-\d{3,}$/, "Use format TSK-0042 (TSK- followed by 3+ digits)");

/** Matches AGD- followed by 3 or more digits (uncapped). */
export const shortAgendaId = z
  .string()
  .regex(/^AGD-\d{3,}$/, "Use format AGD-0015 (AGD- followed by 3+ digits)");

/** Client name or client UUID — must be non-empty. */
export const clientIdentifier = z
  .string()
  .min(1, 'Client name or ID is required');

/** Task status enum values. */
export const taskStatusFilter = z.enum([
  'draft',
  'approved',
  'rejected',
  'pushed',
  'completed',
]);

// ---------------------------------------------------------------------------
// Tool input schemas
// ---------------------------------------------------------------------------

/** Input for get_agenda tool. */
export const GetAgendaInput = z.object({
  client: clientIdentifier,
});
export type GetAgendaInput = z.infer<typeof GetAgendaInput>;

/** Input for get_tasks tool. */
export const GetTasksInput = z.object({
  client: clientIdentifier,
  status: taskStatusFilter.optional(),
});
export type GetTasksInput = z.infer<typeof GetTasksInput>;

/** Input for trigger_intake tool. */
export const TriggerIntakeInput = z.object({
  client: clientIdentifier,
  transcript_source: z.string().optional(),
  date: z.string().optional(),
});
export type TriggerIntakeInput = z.infer<typeof TriggerIntakeInput>;

/** Input for trigger_agenda tool. */
export const TriggerAgendaInput = z.object({
  client: clientIdentifier,
  cycle_start: z.string().optional(),
  cycle_end: z.string().optional(),
});
export type TriggerAgendaInput = z.infer<typeof TriggerAgendaInput>;

/** Input for get_client_status tool. */
export const GetClientStatusInput = z.object({
  client: clientIdentifier,
});
export type GetClientStatusInput = z.infer<typeof GetClientStatusInput>;

/** Input for get_transcript tool. */
export const GetTranscriptInput = z.object({
  client: clientIdentifier,
  date: z.string().optional(),
});
export type GetTranscriptInput = z.infer<typeof GetTranscriptInput>;

/**
 * Input for edit_task tool.
 * At least one editable field must be provided.
 * estimated_time must match the "Xh YYm" format.
 */
export const EditTaskInput = z
  .object({
    id: shortTaskId,
    description: z.string().optional(),
    assignee: z.string().optional(),
    estimated_time: z
      .string()
      .regex(/^\d+h \d{2}m$/, "Use format '1h 30m' or '0h 45m'")
      .optional(),
    workspace: z.string().optional(),
  })
  .refine(
    (data) =>
      data.description !== undefined ||
      data.assignee !== undefined ||
      data.estimated_time !== undefined ||
      data.workspace !== undefined,
    {
      message:
        'Specify at least one field to update (description, assignee, estimated_time, workspace).',
    }
  );
export type EditTaskInput = z.infer<typeof EditTaskInput>;

/** Input for reject_task tool. */
export const RejectTaskInput = z.object({
  id: shortTaskId,
  reason: z.string().optional(),
});
export type RejectTaskInput = z.infer<typeof RejectTaskInput>;

/**
 * Input for approve_tasks tool.
 * Accepts a single short ID string or an array of short IDs.
 */
export const ApproveTasksInput = z.object({
  ids: z.union([shortTaskId, z.array(shortTaskId).min(1)]),
});
export type ApproveTasksInput = z.infer<typeof ApproveTasksInput>;

// No input for list_clients — it takes no parameters.
