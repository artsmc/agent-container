/**
 * Agenda tools for the Mastra runtime.
 *
 * Implements saveDraftAgendaTool which persists agent-generated Running Notes
 * documents as draft agendas via the iExcel API.
 *
 * @see Feature 20 — Agenda Agent
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getApiClient } from '../api-client.js';

// ── saveDraftAgendaTool ─────────────────────────────────────────────────────

const saveDraftAgendaInputSchema = z.object({
  clientId: z.string().uuid().describe('Client UUID to associate the agenda with'),
  content: z.string().min(1).describe('Markdown content for the Running Notes document'),
  cycleStart: z.string().describe('ISO 8601 date for the cycle start'),
  cycleEnd: z.string().describe('ISO 8601 date for the cycle end'),
});

const saveDraftAgendaOutputSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  status: z.literal('draft'),
});

export const saveDraftAgendaTool = createTool({
  id: 'save-draft-agenda',
  description:
    'Save the generated Running Notes document as a draft agenda for a client.',
  inputSchema: saveDraftAgendaInputSchema,
  outputSchema: saveDraftAgendaOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.createAgenda(input.clientId, {
      clientId: input.clientId,
      content: input.content,
      cycleStart: input.cycleStart,
      cycleEnd: input.cycleEnd,
    });
    return {
      id: response.id,
      shortId: response.shortId,
      status: 'draft' as const,
    };
  },
});

// ── getAgenda ─────────────────────────────────────────────────────────────────

const getAgendaInputSchema = z.object({
  agendaId: z.string().describe('Agenda UUID or short ID (e.g., AGD-001)'),
});

const getAgendaOutputSchema = z.object({
  agenda: z.object({
    id: z.string(),
    shortId: z.string(),
    clientId: z.string(),
    status: z.enum(['draft', 'in_review', 'finalized', 'shared']),
    content: z.string(),
    cycleStart: z.string(),
    cycleEnd: z.string(),
    sharedUrlToken: z.string().nullable(),
    internalUrlToken: z.string().nullable(),
    googleDocId: z.string().nullable(),
    finalizedBy: z.string().nullable(),
    finalizedAt: z.string().nullable(),
    sharedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export const getAgenda = createTool({
  id: 'get-agenda',
  description: 'Retrieves a single agenda document by its ID.',
  inputSchema: getAgendaInputSchema,
  outputSchema: getAgendaOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.getAgenda(input.agendaId);
    return { agenda: response.agenda };
  },
});
