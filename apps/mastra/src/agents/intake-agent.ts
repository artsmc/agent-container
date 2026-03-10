/**
 * Intake Agent — AI-powered transcript processing workflow.
 *
 * Processes intake call transcripts and generates structured draft tasks
 * for iExcel team members. The agent:
 *
 * 1. Retrieves the transcript via the API
 * 2. Validates client context and transcript content
 * 3. Calls the LLM with structured output to extract action items
 * 4. Persists each task via the API
 * 5. Reports workflow status (running/completed/failed)
 *
 * Input contract (IntakeAgentInput):
 *   - workflowRunId: UUID of the workflow_run record
 *   - clientId: UUID of the client
 *   - transcriptId: UUID of the transcript record
 *   - callbackBaseUrl: Base URL for API callbacks
 *
 * Output: Updates the workflow run with task creation results.
 *
 * @see Feature 19 — Workflow A: Intake Agent
 */
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { z } from 'zod';
import { env } from '../config/env.js';
import { INTAKE_AGENT_INSTRUCTIONS } from '../prompts/intake-instructions.js';
import {
  saveTasksTool,
  getTranscript,
  listTranscriptsForClient,
  createDraftTasks,
  getTask,
  listTasksForClient,
  updateWorkflowStatusTool,
  listClients,
  ingestTranscript,
  listRecordings,
  importFromUrl,
  importRecordings,
  checkIntegrationStatus,
  connectPlatform,
  checkSessionStatus,
} from '../tools/index.js';
import {
  buildIntakePrompt,
  convertEstimatedTimeToDuration,
} from '../utils/prompt-helpers.js';
import { getApiClient } from '../api-client.js';
import type { NormalizedTranscript } from '@iexcel/shared-types';
import { MeetingType } from '@iexcel/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Input payload for the intake agent invocation.
 * Assembled by the workflow orchestration layer (Feature 17).
 */
export interface IntakeAgentInput {
  workflowRunId: string;
  clientId: string;
  transcriptId: string;
  callbackBaseUrl: string;
}

// ── LLM Output Schema ─────────────────────────────────────────────────────────

/**
 * Zod schema for structured LLM output.
 * Enforces the task format expected by the intake agent.
 */
export const intakeOutputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().min(1).max(255),
      description: z.object({
        taskContext: z.string().min(1),
        additionalContext: z.string().min(1),
        requirements: z.array(z.string().min(1)).min(1),
      }),
      assignee: z.string().nullable(),
      estimatedTime: z
        .string()
        .regex(/^PT(\d+H)?(\d+M)?$/)
        .nullable(),
      scrumStage: z.literal('Backlog'),
      tags: z.array(z.string()).default([]),
    })
  ),
  explanation: z.string().optional(),
});

export type IntakeOutput = z.infer<typeof intakeOutputSchema>;

// ── Agent Definition ──────────────────────────────────────────────────────────

export const intakeAgent = new Agent({
  id: 'intake-agent',
  name: 'Intake Agent',
  description:
    'Processes client call transcripts and generates structured draft tasks.',
  instructions: INTAKE_AGENT_INSTRUCTIONS,
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}` as `${string}/${string}`,
  },
  memory: new Memory({
    options: {
      lastMessages: 20,
    },
  }),
  tools: {
    saveTasksTool,
    getTranscript,
    listTranscriptsForClient,
    createDraftTasks,
    getTask,
    listTasksForClient,
    updateWorkflowStatusTool,
    listClients,
    ingestTranscript,
    listRecordings,
    importFromUrl,
    importRecordings,
    checkIntegrationStatus,
    connectPlatform,
    checkSessionStatus,
  },
});

/**
 * Lightweight agent for structured output generation only.
 * Uses the same model and instructions but without tools, avoiding
 * OpenAI schema validation errors on optional tool parameters.
 */
const intakeGeneratorAgent = new Agent({
  id: 'intake-generator',
  name: 'Intake Generator',
  description: 'Extracts structured tasks from transcripts.',
  instructions: INTAKE_AGENT_INSTRUCTIONS,
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}` as `${string}/${string}`,
  },
});

// ── Helper: Update workflow status via API client ─────────────────────────────

async function updateWorkflowStatus(
  workflowRunId: string,
  status: 'running' | 'completed' | 'failed',
  result?: Record<string, unknown> | null,
  error?: { code: string; message: string } | null,
  logger?: { error: (msg: string, data?: Record<string, unknown>) => void }
): Promise<void> {
  try {
    const apiClient = getApiClient();
    await apiClient.updateWorkflowStatus(workflowRunId, {
      status,
      result: result as Parameters<typeof apiClient.updateWorkflowStatus>[1]['result'],
      error,
    });
  } catch (updateErr) {
    logger?.error('Failed to update workflow status', {
      workflowRunId,
      errorMessage:
        updateErr instanceof Error ? updateErr.message : String(updateErr),
    });
  }
}

// ── Agent Invocation Handler ──────────────────────────────────────────────────

const MAX_LLM_RETRIES = 3;

/**
 * Executes the intake agent workflow.
 *
 * This function is the main entry point for the intake workflow.
 * It orchestrates transcript retrieval, LLM processing, task creation,
 * and workflow status updates.
 *
 * @param input - The intake agent invocation payload
 * @param logger - Optional logger instance (defaults to console)
 */
export async function runIntakeAgent(
  input: IntakeAgentInput,
  logger: {
    info: (msg: string, data?: Record<string, unknown>) => void;
    debug: (msg: string, data?: Record<string, unknown>) => void;
    warn: (msg: string, data?: Record<string, unknown>) => void;
    error: (msg: string, data?: Record<string, unknown>) => void;
  } = console
): Promise<void> {
  const startTime = Date.now();
  const { workflowRunId, clientId, transcriptId } = input;

  // Log: Agent invoked
  logger.info('Intake agent invoked', {
    workflowRunId,
    clientId,
    transcriptId,
  });

  const apiClient = getApiClient();

  // ── Step 1: Retrieve transcript ───────────────────────────────────────────

  let transcriptResponse: Awaited<ReturnType<typeof apiClient.getTranscript>>;
  try {
    transcriptResponse = await apiClient.getTranscript(transcriptId);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logger.error('Failed to retrieve transcript', {
      workflowRunId,
      errorCode: 'TRANSCRIPT_RETRIEVAL_FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs,
    });
    await updateWorkflowStatus(
      workflowRunId,
      'failed',
      null,
      {
        code: 'TRANSCRIPT_RETRIEVAL_FAILED',
        message: `Failed to retrieve transcript: ${err instanceof Error ? err.message : String(err)}`,
      },
      logger
    );
    return;
  }

  // Map the API response to a NormalizedTranscript-compatible shape.
  // The API returns snake_case with the NormalizedTranscript nested inside
  // `normalized_segments`. Extract and merge so `clientId` resolves correctly.
  const rawResponse = transcriptResponse as unknown as Record<string, unknown>;
  const normalizedSegments = (rawResponse.normalized_segments ?? rawResponse.normalizedSegments ?? {}) as Record<string, unknown>;
  const transcript: NormalizedTranscript = {
    source: (normalizedSegments.source ?? 'manual') as NormalizedTranscript['source'],
    sourceId: (normalizedSegments.sourceId ?? '') as string,
    meetingDate: (normalizedSegments.meetingDate ?? rawResponse.call_date ?? rawResponse.callDate ?? '') as string,
    clientId: (normalizedSegments.clientId || rawResponse.client_id || rawResponse.clientId || '') as string,
    meetingType: (normalizedSegments.meetingType ?? rawResponse.call_type ?? rawResponse.callType ?? 'intake') as MeetingType,
    participants: (normalizedSegments.participants ?? []) as string[],
    durationSeconds: (normalizedSegments.durationSeconds ?? 0) as number,
    segments: (normalizedSegments.segments ?? []) as NormalizedTranscript['segments'],
    summary: (normalizedSegments.summary ?? null) as string | null,
    highlights: (normalizedSegments.highlights ?? null) as string[] | null,
  };

  // Log: Transcript retrieved
  logger.debug('Transcript retrieved', {
    workflowRunId,
    transcriptId,
    segmentCount: transcript.segments?.length ?? 0,
    durationSeconds: transcript.durationSeconds,
  });

  // ── Step 2: Validate transcript ───────────────────────────────────────────

  // Check clientId match
  if (transcript.clientId !== clientId) {
    const durationMs = Date.now() - startTime;
    logger.error('Client ID mismatch', {
      workflowRunId,
      errorCode: 'CLIENT_MISMATCH',
      errorMessage: `Transcript clientId "${transcript.clientId}" does not match invocation clientId "${clientId}"`,
      durationMs,
    });
    await updateWorkflowStatus(
      workflowRunId,
      'failed',
      null,
      {
        code: 'CLIENT_MISMATCH',
        message: 'Transcript clientId does not match invocation clientId',
      },
      logger
    );
    return;
  }

  // Check meeting type
  if (transcript.meetingType !== MeetingType.Intake) {
    logger.warn('Transcript meeting type is not "intake"', {
      workflowRunId,
      meetingType: transcript.meetingType,
    });
  }

  // Check for empty transcript
  const hasSegments = transcript.segments && transcript.segments.length > 0;
  const hasSummary =
    transcript.summary !== null && transcript.summary !== undefined;
  if (!hasSegments && !hasSummary) {
    const durationMs = Date.now() - startTime;
    logger.error('Empty transcript — no segments and no summary', {
      workflowRunId,
      errorCode: 'EMPTY_TRANSCRIPT',
      errorMessage: 'Transcript has no segments and no summary',
      durationMs,
    });
    await updateWorkflowStatus(
      workflowRunId,
      'failed',
      null,
      {
        code: 'EMPTY_TRANSCRIPT',
        message:
          'Transcript has no processable content (no segments and no summary)',
      },
      logger
    );
    return;
  }

  // ── Step 3: Update workflow status to running ─────────────────────────────

  await updateWorkflowStatus(workflowRunId, 'running', null, null, logger);

  // ── Step 4: Build LLM prompt ──────────────────────────────────────────────

  const userPrompt = buildIntakePrompt(transcript);

  // ── Step 5: Call LLM with structured output (retry loop) ──────────────────

  let llmOutput: IntakeOutput | null = null;

  for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
    logger.debug('LLM call', { workflowRunId, attempt });

    try {
      const result = await intakeGeneratorAgent.generate(
        attempt === 1
          ? userPrompt
          : `${userPrompt}\n\nIMPORTANT: Your previous response did not conform to the required JSON schema. Please return only the JSON object as specified.`,
        { structuredOutput: { schema: intakeOutputSchema } }
      );

      // Mastra's generate with output schema returns the parsed object
      const parsed = result.object;
      if (parsed) {
        llmOutput = parsed as IntakeOutput;
        logger.debug('LLM output received', {
          workflowRunId,
          tasksExtracted: llmOutput.tasks.length,
          attempt,
        });
        break;
      }

      // If no parsed output, treat as schema violation
      throw new Error('LLM returned no structured output');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn('LLM retry triggered', {
        workflowRunId,
        attempt,
        validationError: errorMessage.substring(0, 500),
      });

      if (attempt === MAX_LLM_RETRIES) {
        const durationMs = Date.now() - startTime;
        logger.error('LLM output invalid after all retries', {
          workflowRunId,
          errorCode: 'LLM_OUTPUT_INVALID',
          errorMessage: `All ${MAX_LLM_RETRIES} LLM attempts failed schema validation`,
          durationMs,
        });
        await updateWorkflowStatus(
          workflowRunId,
          'failed',
          null,
          {
            code: 'LLM_OUTPUT_INVALID',
            message: `LLM output failed schema validation after ${MAX_LLM_RETRIES} attempts`,
          },
          logger
        );
        return;
      }
    }
  }

  if (!llmOutput) {
    // Should not reach here, but guard anyway
    return;
  }

  // ── Step 6: Handle empty task list ────────────────────────────────────────

  if (llmOutput.tasks.length === 0) {
    logger.info('No action items found in transcript', {
      workflowRunId,
      explanation: llmOutput.explanation,
    });
    await updateWorkflowStatus(
      workflowRunId,
      'completed',
      {
        task_short_ids: [],
        tasks_attempted: 0,
        tasks_created: 0,
        tasks_failed: 0,
        explanation: llmOutput.explanation || 'No action items found',
      },
      null,
      logger
    );

    const durationMs = Date.now() - startTime;
    logger.info('Intake agent completed', {
      workflowRunId,
      tasksCreated: 0,
      tasksFailed: 0,
      durationMs,
    });
    return;
  }

  // ── Step 7: Save tasks (batch creation) ─────────────────────────────────

  logger.debug('Task creation started', {
    workflowRunId,
    taskCount: llmOutput.tasks.length,
  });

  let tasksAttempted = llmOutput.tasks.length;
  let tasksCreated = 0;
  let tasksFailed = 0;
  const taskShortIds: string[] = [];

  // Convert ISO 8601 duration (PT2H30M) to HH:MM format for the API
  function durationToHHMM(iso: string | null): string | undefined {
    if (!iso) return undefined;
    const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
    if (!match) return undefined;
    const h = String(match[1] || '0').padStart(2, '0');
    const m = String(match[2] || '0').padStart(2, '0');
    return `${h}:${m}`;
  }

  // Build batch request body matching API's createTasksBodySchema (snake_case)
  const batchBody = {
    transcript_id: transcriptId,
    source: 'agent' as const,
    tasks: llmOutput.tasks.map((task) => ({
      title: task.title,
      description: task.description,
      assignee: task.assignee ?? undefined,
      estimated_time: durationToHHMM(task.estimatedTime),
      scrum_stage: task.scrumStage,
    })),
  };

  try {
    const results = await apiClient.createTasks(clientId, batchBody as any);
    // The API returns { data: [...] } envelope; unwrap if needed
    const rawData = (results as any)?.data ?? results;
    const savedTasks = Array.isArray(rawData) ? rawData : [rawData];
    tasksCreated = savedTasks.length;
    for (const saved of savedTasks) {
      const shortId = (saved as any).shortId ?? (saved as any).short_id;
      if (shortId) taskShortIds.push(shortId);
    }

    logger.debug('Tasks saved', {
      workflowRunId,
      tasksCreated,
    });
  } catch (err) {
    tasksFailed = tasksAttempted;
    logger.warn('Batch task creation failed', {
      workflowRunId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 8: Update workflow status to completed/failed ────────────────────

  const durationMs = Date.now() - startTime;

  // Determine final status
  if (tasksCreated === 0 && llmOutput.tasks.length > 0) {
    // All task saves failed
    logger.error('All task creation requests failed', {
      workflowRunId,
      errorCode: 'TASK_CREATION_FAILED',
      errorMessage: 'All task creation requests failed',
      durationMs,
    });
    await updateWorkflowStatus(
      workflowRunId,
      'failed',
      null,
      {
        code: 'TASK_CREATION_FAILED',
        message:
          'All task creation requests failed. Check API and database connectivity.',
      },
      logger
    );
  } else {
    // Completed (full or partial success)
    logger.info('Intake agent completed', {
      workflowRunId,
      tasksCreated,
      tasksFailed,
      durationMs,
    });
    await updateWorkflowStatus(
      workflowRunId,
      'completed',
      {
        task_short_ids: taskShortIds,
        tasks_attempted: tasksAttempted,
        tasks_created: tasksCreated,
        tasks_failed: tasksFailed,
      },
      null,
      logger
    );
  }
}
