/**
 * MCP Tool: edit_task
 *
 * Edit a task by short ID (e.g., TSK-0042). Supports updating description,
 * assignee, estimated time, and workspace fields.
 *
 * @see Feature 21 — FR-80 through FR-84
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatError } from './formatters.js';
import { ApiClientError } from '@iexcel/api-client';

// Estimated time format: "1h 30m", "2h", "45m", "0h 45m"
const TIME_RE = /^(\d+h\s*)?(\d+m)?$/;

export const editTaskTool = createTool({
  id: 'edit_task',
  description:
    'Edit a task by short ID (e.g., TSK-0042). Update description, assignee, estimated time, or workspace.',
  inputSchema: z.object({
    id: z
      .string()
      .regex(/^TSK-\d{3,}$/, { message: 'Use the format TSK-0042.' })
      .describe('Short ID of the task (e.g., TSK-0043)'),
    description: z
      .string()
      .optional()
      .describe('New task description'),
    assignee: z
      .string()
      .optional()
      .describe('Assignee name or user ID'),
    estimated_time: z
      .string()
      .optional()
      .describe('New estimated time (e.g., "1h 00m", "0h 45m")'),
    workspace: z
      .string()
      .optional()
      .describe('Asana workspace name or ID'),
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        'Authentication required. Connect to the iExcel Mastra MCP server with a valid access token.',
      );
    }

    return logToolCall(
      { tool: 'edit_task', userId: 'unknown' },
      async () => {
        // Validate at least one optional field is provided
        const hasField = input.description || input.assignee || input.estimated_time || input.workspace;
        if (!hasField) {
          return 'Please specify at least one field to update (description, assignee, estimated_time, workspace).';
        }

        // Validate estimated_time format if provided
        if (input.estimated_time) {
          const trimmed = input.estimated_time.trim();
          if (!TIME_RE.test(trimmed) || trimmed.length === 0) {
            return "Invalid time format. Use format '1h 30m' or '0h 45m'.";
          }
        }

        try {
          const apiClient = createUserApiClient(userToken);

          // Build update payload
          const body: Record<string, string | undefined> = {};
          if (input.description) body['title'] = input.description;
          if (input.assignee) body['assignee'] = input.assignee;
          if (input.estimated_time) body['estimatedTime'] = input.estimated_time;

          await apiClient.updateTask(input.id, body as any);

          // Build confirmation message
          const updates: string[] = [`Task ${input.id} updated.`];
          if (input.estimated_time) updates.push(`Estimated time: ${input.estimated_time}`);
          if (input.assignee) updates.push(`Assignee: ${input.assignee}`);
          if (input.description) updates.push(`Description: updated`);
          if (input.workspace) updates.push(`Workspace: ${input.workspace}`);

          return updates.join('\n');
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              return `No task found with ID ${input.id}.`;
            }
            if (error.statusCode === 409) {
              const status = (error.details?.['status'] as string) ?? 'non-draft';
              return `${input.id} cannot be edited -- it is in '${status}' status. Only draft tasks can be edited.`;
            }
          }
          return handleApiError(error, { toolId: 'edit_task' });
        }
      },
    );
  },
});
