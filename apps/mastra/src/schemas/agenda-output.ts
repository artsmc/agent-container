/**
 * Zod schema for the LLM structured output of the Agenda Agent.
 *
 * The agent expects the LLM to return either:
 * 1. A content object with the full Running Notes markdown (min 100 chars)
 * 2. An error object indicating no completed tasks were found
 *
 * @see FRS.md FR-31
 */
import { z } from 'zod';

export const agendaContentSchema = z.object({
  content: z.string().min(100, 'Content must be at least 100 characters'),
});

export const agendaErrorSchema = z.object({
  error: z.literal('NO_COMPLETED_TASKS'),
  message: z.string(),
});

export const agendaOutputSchema = z.union([
  agendaContentSchema,
  agendaErrorSchema,
]);

export type AgendaOutput = z.infer<typeof agendaOutputSchema>;
export type AgendaContentOutput = z.infer<typeof agendaContentSchema>;
export type AgendaErrorOutput = z.infer<typeof agendaErrorSchema>;
