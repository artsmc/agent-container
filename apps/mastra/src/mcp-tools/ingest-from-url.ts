/**
 * MCP Tool: ingest_from_url
 *
 * Ingests a transcript from a URL. Auto-detects the platform (Fireflies, Grain)
 * from the URL pattern, fetches the transcript using stored credentials,
 * and runs it through the detect → parse → enrich → store pipeline.
 *
 * Also accepts any URL for manual platform override.
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

export const ingestFromUrlTool = createTool({
  id: 'ingest_from_url',
  description:
    'Ingest a transcript from a URL. Auto-detects platform (Fireflies, Grain) from the URL, fetches the transcript, and processes it through the pipeline.',
  inputSchema: z.object({
    url: z
      .string()
      .url()
      .describe('URL of the transcript (e.g., Fireflies or Grain recording URL)'),
    client_id: z
      .string()
      .optional()
      .describe('Client UUID to associate the transcript with'),
    meeting_type: z
      .enum(['client_call', 'intake', 'follow_up'])
      .optional()
      .describe('Type of meeting'),
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
      { tool: 'ingest_from_url', userId: 'unknown', clientParam: input.url },
      async () => {
        try {
          const response = await apiCall(userToken, 'POST', '/transcripts/from-url', {
            url: input.url,
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

          const data = await response.json() as { transcriptId: string; versionId: string; format: string };
          return [
            'Transcript ingested successfully.',
            `Transcript ID: ${data.transcriptId}`,
            `Version ID: ${data.versionId}`,
            `Detected format: ${data.format}`,
          ].join('\n');
        } catch (error) {
          return handleApiError(error, {
            toolId: 'ingest_from_url',
            resource: 'transcript',
          });
        }
      },
    );
  },
});
