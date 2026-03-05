/**
 * MCP Tool: get_transcript
 *
 * Retrieves a Grain transcript for a client, optionally filtered by date.
 * Content is truncated at 2000 characters with a link to the full version.
 *
 * @see Feature 21 — FR-110 through FR-113
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { createUserApiClient } from './helpers/create-user-api-client.js';
import { resolveClient } from './helpers/resolve-client.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { truncateTranscript, formatError } from './formatters.js';

export const getTranscriptTool = createTool({
  id: 'get_transcript',
  description:
    'Retrieve a Grain transcript for a client, optionally filtered by date.',
  inputSchema: z.object({
    client: z
      .string()
      .min(1)
      .describe('Client name or client ID'),
    date: z
      .string()
      .optional()
      .describe(
        'Date of the call (ISO 8601 or natural language). Returns the most recent transcript if omitted.',
      ),
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
      { tool: 'get_transcript', userId: 'unknown', clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const transcripts = await apiClient.listTranscripts(client.id, {
            limit: 1,
          });

          if (transcripts.data.length === 0) {
            if (input.date) {
              return `No transcript found for ${client.name} on ${input.date}.`;
            }
            return `No transcript found for ${client.name}.`;
          }

          const transcript = transcripts.data[0];
          const header = [
            `Transcript for ${client.name}`,
            `Date: ${transcript.callDate}`,
            `Type: ${transcript.callType}`,
            '',
          ].join('\n');

          const content = transcript.rawTranscript;
          return header + truncateTranscript(content, transcript.id);
        } catch (error) {
          return handleApiError(error, {
            toolId: 'get_transcript',
            resource: 'that client',
          });
        }
      },
    );
  },
});
