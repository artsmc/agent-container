/**
 * MCP Tool: list_recordings
 *
 * Lists available recordings from a connected platform (Fireflies or Grain).
 * Uses the user's stored platform credentials to fetch the recording list.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { extractToken } from './helpers/extract-token.js';
import { handleApiError } from './helpers/handle-api-error.js';
import { logToolCall } from './helpers/log-tool-call.js';
import { formatError } from './formatters.js';
import { env } from '../config/env.js';

async function apiCall(
  token: string,
  method: string,
  path: string,
): Promise<Response> {
  return fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
}

export const listRecordingsTool = createTool({
  id: 'list_recordings',
  description:
    'List available recordings from a connected meeting platform (Fireflies or Grain). Requires the platform to be connected via Integrations.',
  inputSchema: z.object({
    platform: z
      .enum(['fireflies', 'grain'])
      .describe('Which connected platform to list recordings from'),
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
      { tool: 'list_recordings', userId: 'unknown', clientParam: input.platform },
      async () => {
        try {
          const response = await apiCall(
            userToken,
            'GET',
            `/transcripts/available?platform=${input.platform}`,
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errObj = (errorData as Record<string, unknown>)['error'] as Record<string, unknown> | undefined;
            const message = errObj
              ? (errObj['message'] as string ?? 'Unknown error')
              : `API returned ${response.status}`;
            return formatError(message);
          }

          const data = await response.json() as {
            recordings: Array<{
              id: string;
              title: string;
              date: string;
              durationSeconds: number;
              participants: string[];
            }>;
          };

          if (data.recordings.length === 0) {
            return `No recordings found on ${input.platform}. Check that the platform is connected and has recordings.`;
          }

          const lines = [
            `Found ${data.recordings.length} recording(s) on ${input.platform}:`,
            '',
          ];

          for (const rec of data.recordings) {
            const duration = rec.durationSeconds
              ? `${Math.round(rec.durationSeconds / 60)}min`
              : 'unknown duration';
            const participants = rec.participants.length > 0
              ? rec.participants.join(', ')
              : 'no participants listed';
            lines.push(`- **${rec.title}** (${rec.date}, ${duration})`);
            lines.push(`  Participants: ${participants}`);
            lines.push(`  ID: ${rec.id}`);
            lines.push('');
          }

          lines.push(
            'Use import_recordings to import selected recordings by their IDs.',
          );
          return lines.join('\n');
        } catch (error) {
          return handleApiError(error, {
            toolId: 'list_recordings',
            resource: input.platform,
          });
        }
      },
    );
  },
});
