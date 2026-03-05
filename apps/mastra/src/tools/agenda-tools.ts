/**
 * Placeholder agenda tools for the Mastra runtime.
 *
 * These are stubs that satisfy the Mastra tool registry at runtime.
 * Full implementations ship in Feature 20 (Agenda Agent Tools).
 *
 * @see Feature 20 — Agenda Agent: agenda tool implementations
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const agendaSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  clientId: z.string(),
  status: z.enum(['draft', 'in_review', 'finalized', 'shared']),
  content: z.string().describe('Markdown content of the Running Notes document'),
  cycleStart: z.string().describe('ISO 8601 date'),
  cycleEnd: z.string().describe('ISO 8601 date'),
  sharedUrlToken: z.string().nullable(),
  internalUrlToken: z.string().nullable(),
  googleDocId: z.string().nullable(),
  finalizedBy: z.string().nullable(),
  finalizedAt: z.string().nullable(),
  sharedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── createDraftAgenda ─────────────────────────────────────────────────────────

const createDraftAgendaInputSchema = z.object({
  clientId: z.string().describe('Client UUID to associate the agenda with'),
  content: z
    .string()
    .describe('Initial markdown content for the Running Notes document'),
  cycleStart: z.string().describe('ISO 8601 date for the cycle start'),
  cycleEnd: z.string().describe('ISO 8601 date for the cycle end'),
});

const createDraftAgendaOutputSchema = z.object({
  agenda: agendaSchema,
});

export const createDraftAgenda = createTool({
  id: 'create-draft-agenda',
  description:
    'Creates a draft Running Notes agenda document for a client billing cycle.',
  inputSchema: createDraftAgendaInputSchema,
  outputSchema: createDraftAgendaOutputSchema,
  execute: async (_input, _context) => {
    // TODO(feature-20): Implement via @iexcel/api-client POST /agendas
    throw new Error('Not implemented — see feature 20');
  },
});

// ── getAgenda ─────────────────────────────────────────────────────────────────

const getAgendaInputSchema = z.object({
  agendaId: z.string().describe('Agenda UUID or short ID (e.g., AGD-001)'),
});

const getAgendaOutputSchema = z.object({
  agenda: agendaSchema,
});

export const getAgenda = createTool({
  id: 'get-agenda',
  description: 'Retrieves a single agenda document by its ID.',
  inputSchema: getAgendaInputSchema,
  outputSchema: getAgendaOutputSchema,
  execute: async (_input, _context) => {
    // TODO(feature-20): Implement via @iexcel/api-client GET /agendas/{id}
    throw new Error('Not implemented — see feature 20');
  },
});
