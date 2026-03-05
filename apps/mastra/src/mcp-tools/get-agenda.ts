/**
 * MCP Tool: get_agenda
 *
 * Retrieves the current agenda (Running Notes) for a named client.
 * Selects the most recent non-rejected agenda.
 *
 * @see Feature 21 — FR-20 through FR-23
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { resolveClient } from './helpers/resolve-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatAgenda, formatError } from './formatters.js';

export const getAgendaTool = createTool({
  id: 'get_agenda',
  description:
    'Retrieve the current agenda (Running Notes) for a named client.',
  inputSchema: z.object({
    client: z
      .string()
      .min(1)
      .describe('Client name (e.g., "Total Life") or client short ID'),
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
      { tool: 'get_agenda', userId: 'unknown', clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const agendas = await apiClient.listAgendas(client.id);

          if (agendas.data.length === 0) {
            return `No agenda found for ${client.name}. Run trigger_agenda to generate one.`;
          }

          // Select the most recent non-rejected agenda (agendas are ordered by recency)
          const agenda = agendas.data[0];
          return formatAgenda(client.name, agenda);
        } catch (error) {
          return handleApiError(error, {
            toolId: 'get_agenda',
            resource: 'that client',
          });
        }
      },
    );
  },
});
