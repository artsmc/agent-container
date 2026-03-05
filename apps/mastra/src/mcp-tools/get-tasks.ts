/**
 * MCP Tool: get_tasks
 *
 * Lists generated tasks for a client, optionally filtered by status.
 * Returns short IDs, never UUIDs.
 *
 * @see Feature 21 — FR-30 through FR-33
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { resolveClient } from './helpers/resolve-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatTaskTable, formatError } from './formatters.js';

export const getTasksTool = createTool({
  id: 'get_tasks',
  description:
    'List generated tasks for a client, optionally filtered by status. Returns short IDs.',
  inputSchema: z.object({
    client: z
      .string()
      .min(1)
      .describe('Client name or client ID'),
    status: z
      .enum(['draft', 'approved', 'rejected', 'completed'])
      .optional()
      .describe('Filter by task status. Omit to return all statuses.'),
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
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
      { tool: 'get_tasks', userId: 'unknown', clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const tasks = await apiClient.listTasks(client.id, {
            status: input.status as any,
          });

          if (tasks.data.length === 0) {
            if (input.status) {
              return `No ${input.status} tasks found for ${client.name}.`;
            }
            return `No tasks found for ${client.name}.`;
          }

          return formatTaskTable(tasks.data);
        } catch (error) {
          return handleApiError(error, {
            toolId: 'get_tasks',
            resource: 'that client',
          });
        }
      },
    );
  },
});
