/**
 * Agenda Agent — Workflow B: Pre-Call to Build Agenda.
 *
 * Generates a six-section Running Notes document from reconciled task data
 * and persists it as a draft agenda via the iExcel API.
 *
 * ## Input Contract
 * Invoked with `AgendaAgentInput`:
 *   - workflowRunId: UUID of the workflow run record
 *   - clientId: UUID of the client
 *   - clientName: Display name of the client (optional, defaults to clientId)
 *   - cycleStart: ISO 8601 date (e.g., '2026-02-01')
 *   - cycleEnd: ISO 8601 date (e.g., '2026-02-28')
 *
 * ## Output Contract
 * On success: updates workflow to `completed` with result containing
 *   agenda_short_id, tasks_analyzed, tasks_completed, tasks_incomplete.
 * On failure: updates workflow to `failed` with error code and message.
 *
 * ## Running Notes Sections
 * 1. Completed Tasks (theme-grouped prose)
 * 2. Incomplete Tasks
 * 3. Relevant Deliverables
 * 4. Recommendations (2-4 items)
 * 5. New Ideas (1-3 items)
 * 6. Next Steps (3-5 items)
 *
 * @see Feature 20 — Agenda Agent
 */
import { Agent } from '@mastra/core/agent';
import { AGENDA_AGENT_INSTRUCTIONS } from '../prompts/agenda-instructions.js';
import { env } from '../config/env.js';
import { getReconciledTasksTool, saveDraftAgendaTool } from '../tools/index.js';
import { updateWorkflowStatusTool } from '../tools/workflow-tools.js';

export const agendaAgent = new Agent({
  id: 'agenda-agent',
  name: 'Agenda Agent',
  description:
    'Compiles reconciled tasks into a structured Running Notes agenda for client review.',
  instructions: AGENDA_AGENT_INSTRUCTIONS,
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}` as `${string}/${string}`,
  },
  tools: {
    getReconciledTasksTool,
    saveDraftAgendaTool,
    updateWorkflowStatusTool,
  },
});
