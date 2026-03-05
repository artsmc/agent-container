/**
 * MCP Tool: get_client_status
 *
 * Returns an overview of a client's current workflow cycle status,
 * including pending approvals, agenda readiness, and upcoming call date.
 *
 * @see Feature 21 — FR-60 through FR-64
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { resolveClient } from './helpers/resolve-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatClientStatus, formatError } from './formatters.js';

export const getClientStatusTool = createTool({
  id: 'get_client_status',
  description:
    "Get an overview of a client's current workflow cycle -- pending approvals, agenda readiness, and upcoming call date.",
  inputSchema: z.object({
    client: z
      .string()
      .min(1)
      .describe('Client name (e.g., "Total Life") or client ID'),
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
      { tool: 'get_client_status', userId: 'unknown', clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const status = await apiClient.getClientStatus(client.id);
          return formatClientStatus(client.name, status);
        } catch (error) {
          return handleApiError(error, {
            toolId: 'get_client_status',
            resource: 'that client',
          });
        }
      },
    );
  },
});
