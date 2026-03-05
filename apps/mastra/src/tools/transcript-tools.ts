/**
 * Placeholder transcript tools for the Mastra runtime.
 *
 * These are stubs that satisfy the Mastra tool registry at runtime.
 * Full implementations ship in Feature 19 (Intake Agent Tools).
 *
 * @see Feature 19 — Intake Agent: transcript tool implementations
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

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
  execute: async (_input, _context) => {
    // TODO(feature-19): Implement via @iexcel/api-client GET /transcripts/{id}
    throw new Error('Not implemented — see feature 19');
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
  execute: async (_input, _context) => {
    // TODO(feature-19): Implement via @iexcel/api-client GET /transcripts?clientId=...
    throw new Error('Not implemented — see feature 19');
  },
});
