/**
 * Transcript tools for the Mastra runtime.
 *
 * Provides tools for retrieving and listing transcripts via the iExcel API.
 *
 * @see Feature 19 — Intake Agent
 */
import { createTool } from '@mastra/core/tools';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';
import { getApiClient } from '../api-client.js';
import { extractToken } from '../mcp-tools/helpers/extract-token.js';
import { createUserApiClient } from '../mcp-tools/helpers/create-user-api-client.js';

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const transcriptSegmentSchema = z.object({
  speaker: z.string(),
  timestamp: z.number(),
  text: z.string(),
});

const transcriptSchema = z.object({
  id: z.string(),
  source: z.enum(['grain', 'manual']),
  sourceId: z.string(),
  meetingDate: z.string(),
  clientId: z.string(),
  meetingType: z.enum(['client_call', 'intake', 'follow_up']),
  participants: z.array(z.string()),
  durationSeconds: z.number(),
  segments: z.array(transcriptSegmentSchema),
  summary: z.string().nullable(),
  highlights: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── getTranscript ─────────────────────────────────────────────────────────────

const getTranscriptInputSchema = z.object({
  transcriptId: z.string().describe('Transcript UUID'),
});

const getTranscriptOutputSchema = z.object({
  transcript: transcriptSchema,
});

export const getTranscript = createTool({
  id: 'get-transcript',
  description: 'Retrieves a single transcript by its ID.',
  inputSchema: getTranscriptInputSchema,
  outputSchema: getTranscriptOutputSchema,
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    const apiClient = userToken ? createUserApiClient(userToken) : getApiClient();
    const response = await apiClient.getTranscript(input.transcriptId);
    // The API returns GetTranscriptResponse — we need to return a NormalizedTranscript-like shape.
    // The transcript data includes the normalized fields.
    return { transcript: response as unknown as z.infer<typeof transcriptSchema> };
  },
});

// ── listTranscriptsForClient ───────────────────────────────────────────────────

const listTranscriptsForClientInputSchema = z.object({
  clientId: z.string().describe('Client UUID to list transcripts for'),
  meetingType: z
    .enum(['client_call', 'intake', 'follow_up'])
    .optional()
    .describe('Filter by meeting type'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe('Maximum number of transcripts to return'),
});

const listTranscriptsForClientOutputSchema = z.object({
  transcripts: z.array(transcriptSchema),
  total: z.number().int(),
});

export const listTranscriptsForClient = createTool({
  id: 'list-transcripts-for-client',
  description:
    'Lists transcripts for a specific client, with optional meeting type filter.',
  inputSchema: listTranscriptsForClientInputSchema,
  outputSchema: listTranscriptsForClientOutputSchema,
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    const apiClient = userToken ? createUserApiClient(userToken) : getApiClient();
    const response = await apiClient.listTranscripts(input.clientId, {
      limit: input.limit,
    });
    return {
      transcripts: response.data as unknown as z.infer<typeof transcriptSchema>[],
      total: response.total,
    };
  },
});
