/**
 * MCP Tool: trigger_intake
 *
 * Kicks off Workflow A -- processes a call transcript and generates draft tasks.
 * Returns the workflow run ID immediately without polling for completion.
 *
 * @see Feature 21 — FR-40 through FR-44
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

export const triggerIntakeTool = createTool({
  id: 'trigger_intake',
  description:
    'Kick off Workflow A -- process a call transcript and generate draft tasks. Returns the workflow run ID.',
  inputSchema: z.object({
    client: z
      .string()
      .min(1)
      .describe('Client name or client ID'),
    date: z
      .string()
      .optional()
      .describe(
        'Date of the intake call (ISO 8601 or natural language: "today", "yesterday"). Used to identify the correct transcript.',
      ),
    transcript_source: z
      .string()
      .optional()
      .describe(
        'Grain URL or transcript text. If omitted, Mastra fetches the latest transcript for the client.',
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
      { tool: 'trigger_intake', userId: 'unknown', clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);

          // We need a transcriptId. Find the most recent transcript for this client.
          const transcripts = await apiClient.listTranscripts(client.id, { limit: 1 });
          if (transcripts.data.length === 0) {
            const dateStr = input.date ? ` on ${input.date}` : '';
            return `No transcript found for ${client.name}${dateStr}. Verify the date or provide a transcript source.`;
          }

          const transcriptId = transcripts.data[0].id;
          const result = await apiClient.triggerIntakeWorkflow({
            clientId: client.id,
            transcriptId,
          });

          return [
            `Intake workflow started for ${client.name}.`,
            `Workflow Run ID: ${result.id}`,
            `Use get_tasks(client="${client.name}", status="draft") to check for generated tasks once complete.`,
          ].join('\n');
        } catch (error) {
          // Handle specific error cases
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              const dateStr = input.date ? ` on ${input.date}` : '';
              return `No transcript found for ${input.client}${dateStr}. Verify the date or provide a transcript source.`;
            }
            if (error.statusCode === 409) {
              return `A workflow is already running for ${input.client}. Check status with get_client_status.`;
            }
          }
          return handleApiError(error, {
            toolId: 'trigger_intake',
            resource: 'that client',
          });
        }
      },
    );
  },
});
