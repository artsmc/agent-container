/**
 * MCP Tool: ingest_from_text
 *
 * Ingests a transcript from raw text. Runs format detection (SRT, turnbased, raw),
 * parses it into a NormalizedTranscript, and stores it.
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

export const ingestFromTextTool = createTool({
  id: 'ingest_from_text',
  description:
    'Ingest a transcript from raw text. Auto-detects format (SRT, turn-based, raw), parses, and stores the transcript.',
  inputSchema: z.object({
    raw_text: z
      .string()
      .min(1)
      .describe('The raw transcript text to ingest'),
    client_id: z
      .string()
      .optional()
      .describe('Client UUID to associate the transcript with'),
    meeting_type: z
      .enum(['client_call', 'intake', 'follow_up'])
      .optional()
      .describe('Type of meeting'),
    call_date: z
      .string()
      .optional()
      .describe('Date of the call (ISO 8601). Defaults to now if omitted.'),
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
      { tool: 'ingest_from_text', userId: 'unknown', clientParam: input.client_id ?? 'none' },
      async () => {
        try {
          const response = await apiCall(userToken, 'POST', '/transcripts/parse', {
            rawText: input.raw_text,
            clientId: input.client_id,
            meetingType: input.meeting_type,
            callDate: input.call_date,
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
            toolId: 'ingest_from_text',
            resource: 'transcript',
          });
        }
      },
    );
  },
});
