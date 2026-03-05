/**
 * Agenda Agent — placeholder for the Running Notes document generation workflow.
 *
 * This agent compiles approved tasks for a billing cycle into a structured
 * Running Notes agenda document ready for client review.
 * The full implementation ships in Feature 20 (Agenda Agent).
 *
 * @see Feature 20 — Agenda Agent: full system prompt and tool wiring
 */
import { Agent } from '@mastra/core/agent';
import { env } from '../config/env.js';
import {
  getTask,
  listTasksForClient,
  createDraftAgenda,
  getAgenda,
} from '../tools/index.js';

export const agendaAgent = new Agent({
  id: 'agenda-agent',
  name: 'Agenda Agent',
  description:
    'Compiles approved tasks into a structured Running Notes agenda for client review.',
  // TODO(feature-20): Replace with a detailed system prompt that instructs the
  // agent on how to group tasks, write cycle summaries, and format the agenda.
  instructions:
    'You are the iExcel Agenda Agent. ' +
    'You compile the approved tasks for a billing cycle into a well-structured ' +
    'Running Notes document. ' +
    'Group tasks by category, include effort estimates, and write a brief cycle summary. ' +
    'Use the provided tools to fetch tasks and persist the generated agenda.',
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}` as `${string}/${string}`,
  },
  tools: {
    getTask,
    listTasksForClient,
    createDraftAgenda,
    getAgenda,
  },
});
