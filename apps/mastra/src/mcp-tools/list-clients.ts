/**
 * MCP Tool: list_clients
 *
 * Lists all clients the authenticated user has access to.
 * No parameters required — uses the user's token to scope results.
 *
 * @see Feature 21 — FR-70 through FR-74
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatClientList, formatError } from './formatters.js';

export const listClientsTool = createTool({
  id: 'list_clients',
  description: 'List all clients the authenticated user has access to.',
  inputSchema: z.object({}),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  execute: async (_input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        'Authentication required. Connect to the iExcel Mastra MCP server with a valid access token.',
      );
    }

    return logToolCall(
      { tool: 'list_clients', userId: 'unknown' },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const result = await apiClient.listClients();

          if (result.data.length === 0) {
            return 'No clients found for your account. Contact your administrator.';
          }

          return formatClientList(result.data);
        } catch (error) {
          return handleApiError(error, { toolId: 'list_clients' });
        }
      },
    );
  },
});
