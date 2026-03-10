/**
 * MCP Tool: import_recordings
 *
 * Batch-imports recordings from a connected platform by their IDs.
 * Fetches each transcript via the platform connector, runs it through
 * the detect → parse → enrich → store pipeline.
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
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const importRecordingsTool = createTool({
  id: 'import_recordings',
  description:
    'Import recordings from a connected platform by their IDs. Use list_recordings first to get available recording IDs.',
  inputSchema: z.object({
    platform: z
      .enum(['fireflies', 'grain'])
      .describe('Which platform the recordings are from'),
    recording_ids: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe('Array of recording IDs to import (max 20)'),
    client_id: z
      .string()
      .optional()
      .describe('Client UUID to associate imported transcripts with'),
    meeting_type: z
      .enum(['client_call', 'intake', 'follow_up'])
      .optional()
      .describe('Type of meeting for all imported recordings'),
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
      { tool: 'import_recordings', userId: 'unknown', clientParam: input.platform },
      async () => {
        try {
          const response = await apiCall(userToken, 'POST', '/transcripts/import', {
            platform: input.platform,
            recordingIds: input.recording_ids,
            clientId: input.client_id,
            meetingType: input.meeting_type,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errObj = (errorData as Record<string, unknown>)['error'] as Record<string, unknown> | undefined;
            const message = errObj
              ? (errObj['message'] as string ?? 'Unknown error')
              : `API returned ${response.status}`;
            return formatError(message);
          }

          const data = await response.json() as {
            results: Array<{
              recordingId: string;
              success: boolean;
              transcriptId?: string;
              error?: string;
            }>;
          };

          const succeeded = data.results.filter((r) => r.success);
          const failed = data.results.filter((r) => !r.success);

          const lines = [
            `Import complete: ${succeeded.length} succeeded, ${failed.length} failed.`,
            '',
          ];

          if (succeeded.length > 0) {
            lines.push('Imported:');
            for (const r of succeeded) {
              lines.push(`  - ${r.recordingId} → Transcript ${r.transcriptId}`);
            }
          }

          if (failed.length > 0) {
            lines.push('');
            lines.push('Failed:');
            for (const r of failed) {
              lines.push(`  - ${r.recordingId}: ${r.error ?? 'Unknown error'}`);
            }
          }

          return lines.join('\n');
        } catch (error) {
          return handleApiError(error, {
            toolId: 'import_recordings',
            resource: input.platform,
          });
        }
      },
    );
  },
});
