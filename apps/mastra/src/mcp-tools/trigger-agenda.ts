/**
 * MCP Tool: trigger_agenda
 *
 * Kicks off Workflow B -- compiles completed tasks into a Running Notes agenda.
 * Returns the workflow run ID immediately without polling for completion.
 *
 * @see Feature 21 — FR-50 through FR-54
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { resolveClient } from './helpers/resolve-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatError } from './formatters.js';
import { ApiClientError } from '@iexcel/api-client';

export const triggerAgendaTool = createTool({
  id: 'trigger_agenda',
  description:
    'Kick off Workflow B -- compile completed tasks into a Running Notes agenda. Returns the workflow run ID.',
  inputSchema: z.object({
    client: z
      .string()
      .min(1)
      .describe('Client name or client ID'),
    cycle_start: z
      .string()
      .optional()
      .describe(
        'Start date of the work cycle (ISO 8601). Defaults to the last agenda date if omitted.',
      ),
    cycle_end: z
      .string()
      .optional()
      .describe(
        'End date of the work cycle (ISO 8601). Defaults to today if omitted.',
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
      { tool: 'trigger_agenda', userId: 'unknown', clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);

          // Default cycle dates if not provided
          const cycleEnd = input.cycle_end ?? new Date().toISOString().split('T')[0];
          const cycleStart = input.cycle_start ?? cycleEnd; // API determines the actual default

          const result = await apiClient.triggerAgendaWorkflow({
            clientId: client.id,
            cycleStart,
            cycleEnd,
          });

          return [
            `Agenda workflow started for ${client.name}.`,
            `Workflow Run ID: ${result.id}`,
            `Use get_agenda(client="${client.name}") to check the generated agenda once complete.`,
          ].join('\n');
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404 || error.statusCode === 422) {
              return `No completed tasks found for ${input.client} in the specified cycle. Ensure tasks are marked completed before generating an agenda.`;
            }
            if (error.statusCode === 409) {
              return `A workflow is already running for ${input.client}. Check status with get_client_status.`;
            }
          }
          return handleApiError(error, {
            toolId: 'trigger_agenda',
            resource: 'that client',
          });
        }
      },
    );
  },
});
