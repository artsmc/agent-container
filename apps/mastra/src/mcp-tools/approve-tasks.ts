/**
 * MCP Tool: approve_tasks
 *
 * Approve one or more draft tasks by short ID.
 * Supports both individual (single) and batch (multiple) approval.
 *
 * @see Feature 21 — FR-100 through FR-104
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatError } from './formatters.js';
import { ApiClientError } from '@iexcel/api-client';

const shortIdPattern = /^TSK-\d{3,}$/;

export const approveTasksTool = createTool({
  id: 'approve_tasks',
  description:
    'Approve one or more draft tasks by short ID. Supports individual and batch approval.',
  inputSchema: z.object({
    ids: z
      .union([
        z.string().regex(shortIdPattern),
        z.array(z.string().regex(shortIdPattern)).min(1),
      ])
      .describe(
        'Short ID or array of short IDs (e.g., "TSK-0042" or ["TSK-0042", "TSK-0043"])',
      ),
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
      { tool: 'approve_tasks', userId: 'unknown' },
      async () => {
        // Normalize to array
        const ids = Array.isArray(input.ids) ? input.ids : [input.ids];

        try {
          const apiClient = createUserApiClient(userToken);

          if (ids.length === 1) {
            // Single task approval
            try {
              await apiClient.approveTask(ids[0]);
              return `Task ${ids[0]} approved.`;
            } catch (error) {
              if (error instanceof ApiClientError) {
                if (error.statusCode === 404) {
                  return `No task found with ID ${ids[0]}.`;
                }
                if (error.statusCode === 409) {
                  const status = (error.details?.['status'] as string) ?? 'non-draft';
                  return `${ids[0]} cannot be approved -- it is in '${status}' status.`;
                }
              }
              throw error;
            }
          }

          // Batch approval: resolve clientId from the first task
          const firstTask = await apiClient.getTask(ids[0]);
          const clientId = firstTask.task.clientId;

          const result = await apiClient.batchApproveTasks(clientId, {
            taskIds: ids,
          });

          // Format results with success/skip breakdown
          const succeeded = result.succeeded;
          const failed = result.failed;

          if (succeeded.length === 0 && failed.length > 0) {
            return 'None of the provided task IDs could be found. Check IDs with get_tasks.';
          }

          const parts: string[] = [];
          if (succeeded.length > 0) {
            parts.push(`${succeeded.length} tasks approved: ${succeeded.join(', ')}.`);
          }
          if (failed.length > 0) {
            const skipped = failed.map((f) => f.id).join(', ');
            parts.push(`${skipped} was not in draft status and was skipped.`);
          }

          return parts.join(' ');
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              return 'None of the provided task IDs could be found. Check IDs with get_tasks.';
            }
          }
          return handleApiError(error, { toolId: 'approve_tasks' });
        }
      },
    );
  },
});
