/**
 * MCP Tool: reject_task
 *
 * Reject a task by short ID. The task must be in draft status.
 * Optionally includes a rejection reason for the audit log.
 *
 * @see Feature 21 — FR-85 through FR-89
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatError } from './formatters.js';
import { ApiClientError } from '@iexcel/api-client';

export const rejectTaskTool = createTool({
  id: 'reject_task',
  description:
    'Reject a task by short ID. The task must be in draft status.',
  inputSchema: z.object({
    id: z
      .string()
      .regex(/^TSK-\d{3,}$/, { message: 'Use the format TSK-0042.' })
      .describe('Short ID of the task (e.g., TSK-0044)'),
    reason: z
      .string()
      .optional()
      .describe('Optional rejection reason for the audit log'),
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
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
      { tool: 'reject_task', userId: 'unknown' },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const body = input.reason ? { reason: input.reason } : undefined;
          await apiClient.rejectTask(input.id, body);
          return `Task ${input.id} rejected.`;
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              return `No task found with ID ${input.id}.`;
            }
            if (error.statusCode === 409) {
              const status = (error.details?.['status'] as string) ?? 'non-draft';
              return `${input.id} cannot be rejected -- it is in '${status}' status.`;
            }
          }
          return handleApiError(error, { toolId: 'reject_task' });
        }
      },
    );
  },
});
