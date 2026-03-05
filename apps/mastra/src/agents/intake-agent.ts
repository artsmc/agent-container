/**
 * Intake Agent — placeholder for the AI-powered transcript processing workflow.
 *
 * This agent listens to normalised transcripts and produces draft tasks.
 * The full implementation (instructions, tool logic, multi-step workflow) ships
 * in Feature 19 (Intake Agent).
 *
 * @see Feature 19 — Intake Agent: full system prompt and tool wiring
 */
import { Agent } from '@mastra/core/agent';
import { env } from '../config/env.js';
import {
  getTranscript,
  listTranscriptsForClient,
  createDraftTasks,
  getTask,
  listTasksForClient,
} from '../tools/index.js';

export const intakeAgent = new Agent({
  id: 'intake-agent',
  name: 'Intake Agent',
  description:
    'Processes client call transcripts and generates structured draft tasks.',
  // TODO(feature-19): Replace with a detailed system prompt that instructs the
  // agent on how to extract, categorise, and format tasks from transcripts.
  instructions:
    'You are the iExcel Intake Agent. ' +
    'You analyse client call transcripts and produce a structured list of draft tasks. ' +
    'Each task must include a clear title, context, requirements, and an estimated effort. ' +
    'Use the provided tools to fetch transcripts and persist the generated tasks.',
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}` as `${string}/${string}`,
  },
  tools: {
    getTranscript,
    listTranscriptsForClient,
    createDraftTasks,
    getTask,
    listTasksForClient,
  },
});
