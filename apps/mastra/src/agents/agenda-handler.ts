/**
 * Agenda Agent Handler — orchestration logic for Workflow B.
 *
 * This handler implements the full agent invocation flow:
 *   1. Retrieve reconciled tasks via getReconciledTasksTool
 *   2. Classify into completed / incomplete
 *   3. Validate: if no completed tasks, fail the workflow
 *   4. Update workflow run to 'running'
 *   5. Build prompt via buildAgendaPrompt
 *   6. Call LLM with structured output (retry loop, 3 attempts max)
 *   7. Validate section headers in LLM output
 *   8. Save draft agenda via saveDraftAgendaTool
 *   9. Update workflow run to 'completed'
 *
 * @see FRS.md FR-20 through FR-42
 * @see TR.md Section 5 — Data Flow
 */
import { agendaAgent } from './agenda-agent.js';
import { getApiClient } from '../api-client.js';
import {
  buildAgendaPrompt,
  validateSections,
  formatCycleRange,
  type PromptTask,
} from '../utils/agenda-prompt-helpers.js';
import { agendaOutputSchema, type AgendaOutput } from '../schemas/agenda-output.js';

/** Maximum LLM + validation retry attempts. */
const MAX_ATTEMPTS = 3;
/** Maximum completed tasks to include in prompt. */
const MAX_COMPLETED = 30;
/** Maximum incomplete tasks to include in prompt. */
const MAX_INCOMPLETE = 20;

/**
 * Input payload for the agenda agent handler.
 * Assembled by Feature 17 (Workflow Orchestration).
 */
export interface AgendaAgentInput {
  workflowRunId: string;
  clientId: string;
  clientName?: string;
  cycleStart: string;
  cycleEnd: string;
  callbackBaseUrl?: string;
}

/**
 * Result returned by the handler on success.
 */
export interface AgendaAgentResult {
  success: boolean;
  agendaShortId?: string;
  tasksAnalyzed?: number;
  tasksCompleted?: number;
  tasksIncomplete?: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Executes the agenda agent workflow.
 *
 * This function encapsulates the full orchestration logic and can be
 * called directly by Feature 17's workflow trigger or via a Mastra
 * agent endpoint.
 */
export async function runAgendaAgent(input: AgendaAgentInput): Promise<AgendaAgentResult> {
  const startTime = Date.now();
  const { workflowRunId, clientId, cycleStart, cycleEnd } = input;
  const clientName = input.clientName ?? clientId;
  const apiClient = getApiClient();

  // ── Log: Agent invoked ──────────────────────────────────────────────────
  console.info('[agenda-agent] Agent invoked', {
    workflowRunId,
    clientId,
    cycleStart,
    cycleEnd,
  });

  // ── Step 1: Retrieve reconciled tasks ───────────────────────────────────
  let allTasks: PromptTask[];
  try {
    const response = await apiClient.listTasks(clientId, {
      status: 'pushed' as any,
      limit: 100,
    });

    allTasks = response.data.map((task: any) => ({
      shortId: task.shortId,
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      estimatedTime: task.estimatedTime,
      scrumStage: task.scrumStage,
      asanaStatus: task.asanaStatus ?? 'not_found',
      asanaCompleted: task.asanaCompleted ?? null,
      asanaCompletedAt: task.asanaCompletedAt ?? null,
    }));

    // Handle pagination
    let hasMore = response.hasMore;
    let page = 2;
    while (hasMore) {
      const nextPage = await apiClient.listTasks(clientId, {
        status: 'pushed' as any,
        page,
        limit: 100,
      });
      for (const task of nextPage.data) {
        allTasks.push({
          shortId: (task as any).shortId,
          title: task.title,
          description: task.description as any,
          assignee: task.assignee,
          estimatedTime: task.estimatedTime,
          scrumStage: task.scrumStage,
          asanaStatus: (task as any).asanaStatus ?? 'not_found',
          asanaCompleted: (task as any).asanaCompleted ?? null,
          asanaCompletedAt: (task as any).asanaCompletedAt ?? null,
        });
      }
      hasMore = nextPage.hasMore;
      page++;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during task retrieval';
    console.error('[agenda-agent] Task retrieval failed', {
      workflowRunId,
      errorCode: 'TASK_RETRIEVAL_FAILED',
      errorMessage,
      durationMs: Date.now() - startTime,
    });

    await safeUpdateStatus(apiClient, workflowRunId, 'failed', undefined, {
      code: 'TASK_RETRIEVAL_FAILED',
      message: errorMessage,
    });

    return {
      success: false,
      errorCode: 'TASK_RETRIEVAL_FAILED',
      errorMessage,
    };
  }

  // ── Step 2: Classify tasks ──────────────────────────────────────────────
  const completedTasks = allTasks.filter((t) => t.asanaStatus === 'completed');
  const incompleteTasks = allTasks.filter((t) => t.asanaStatus !== 'completed');

  console.debug('[agenda-agent] Tasks retrieved', {
    workflowRunId,
    clientId,
    totalTasks: allTasks.length,
    completedCount: completedTasks.length,
    incompleteCount: incompleteTasks.length,
  });

  // ── Step 3: Empty completed tasks guard ─────────────────────────────────
  if (completedTasks.length === 0) {
    console.warn('[agenda-agent] Empty completed tasks guard triggered', {
      workflowRunId,
      clientId,
      pushedTaskCount: allTasks.length,
    });

    await safeUpdateStatus(apiClient, workflowRunId, 'failed', undefined, {
      code: 'NO_COMPLETED_TASKS',
      message: 'No completed tasks found for this client in the specified cycle window. Cannot generate agenda.',
    });

    return {
      success: false,
      tasksAnalyzed: allTasks.length,
      tasksCompleted: 0,
      tasksIncomplete: incompleteTasks.length,
      errorCode: 'NO_COMPLETED_TASKS',
      errorMessage: 'No completed tasks found for this client in the specified cycle window. Cannot generate agenda.',
    };
  }

  // ── Step 3.5: Apply 50-task limit guard ─────────────────────────────────
  let truncCompleted = [...completedTasks].sort((a, b) => {
    const aDate = a.asanaCompletedAt ?? '';
    const bDate = b.asanaCompletedAt ?? '';
    return bDate.localeCompare(aDate);
  });
  let truncIncomplete = [...incompleteTasks];

  if (truncCompleted.length > MAX_COMPLETED || truncIncomplete.length > MAX_INCOMPLETE) {
    console.warn('[agenda-agent] Task limit guard triggered', {
      workflowRunId,
      clientId,
      originalCompleted: completedTasks.length,
      originalIncomplete: incompleteTasks.length,
      truncatedCompleted: Math.min(truncCompleted.length, MAX_COMPLETED),
      truncatedIncomplete: Math.min(truncIncomplete.length, MAX_INCOMPLETE),
    });
    truncCompleted = truncCompleted.slice(0, MAX_COMPLETED);
    truncIncomplete = truncIncomplete.slice(0, MAX_INCOMPLETE);
  }

  // ── Step 4: Update workflow run to 'running' ───────────────────────────
  await safeUpdateStatus(apiClient, workflowRunId, 'running');

  // ── Step 5: Build prompt ────────────────────────────────────────────────
  const userPrompt = buildAgendaPrompt(
    clientName,
    cycleStart,
    cycleEnd,
    truncCompleted,
    truncIncomplete,
  );

  // ── Step 6 & 7: LLM call with retry loop ───────────────────────────────
  let agendaContent: string | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.debug('[agenda-agent] LLM called', {
      workflowRunId,
      attempt,
      completedTaskCount: truncCompleted.length,
      incompleteTaskCount: truncIncomplete.length,
    });

    try {
      let clarifyingNote = '';
      if (attempt > 1) {
        clarifyingNote = `\n\nIMPORTANT: Your previous response was rejected because: ${lastError}. ` +
          'Please ensure your response includes ALL six required section headers ' +
          '(## Completed Tasks, ## Incomplete Tasks, ## Relevant Deliverables, ' +
          '## Recommendations, ## New Ideas, ## Next Steps) and that the content ' +
          'field is at least 100 characters long.';
      }

      const result = await agendaAgent.generate(
        [{ role: 'user', content: userPrompt + clarifyingNote }],
        {
          structuredOutput: {
            schema: agendaOutputSchema,
          },
        },
      );

      const output = result.object as AgendaOutput;

      console.debug('[agenda-agent] LLM output received', {
        workflowRunId,
        contentLength: 'content' in output ? output.content.length : 0,
        attempt,
      });

      // Check for NO_COMPLETED_TASKS error response from LLM
      if ('error' in output && output.error === 'NO_COMPLETED_TASKS') {
        console.warn('[agenda-agent] LLM returned NO_COMPLETED_TASKS', {
          workflowRunId,
          attempt,
        });

        await safeUpdateStatus(apiClient, workflowRunId, 'failed', undefined, {
          code: 'NO_COMPLETED_TASKS',
          message: output.message,
        });

        return {
          success: false,
          tasksAnalyzed: allTasks.length,
          tasksCompleted: completedTasks.length,
          tasksIncomplete: incompleteTasks.length,
          errorCode: 'NO_COMPLETED_TASKS',
          errorMessage: output.message,
        };
      }

      // Validate content
      if (!('content' in output) || output.content.length < 100) {
        lastError = 'Content field is missing or too short (minimum 100 characters required)';
        console.warn('[agenda-agent] LLM retry triggered', {
          workflowRunId,
          attempt,
          validationError: lastError,
        });
        continue;
      }

      // Validate sections
      const sectionResult = validateSections(output.content);
      if (!sectionResult.valid) {
        lastError = `Missing required sections: ${sectionResult.missing.join(', ')}`;
        console.warn('[agenda-agent] LLM retry triggered', {
          workflowRunId,
          attempt,
          validationError: lastError,
        });
        continue;
      }

      console.debug('[agenda-agent] Section validation passed', {
        workflowRunId,
        sectionsFound: [
          '## Completed Tasks',
          '## Incomplete Tasks',
          '## Relevant Deliverables',
          '## Recommendations',
          '## New Ideas',
          '## Next Steps',
        ],
      });

      // Add the document header
      const cycleRange = formatCycleRange(cycleStart, cycleEnd);
      const fullContent = `# Running Notes \u2014 ${clientName} \u2014 ${cycleRange}\n\n${output.content}`;
      agendaContent = fullContent;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'LLM call failed';
      console.warn('[agenda-agent] LLM retry triggered', {
        workflowRunId,
        attempt,
        validationError: lastError,
      });

      if (attempt === MAX_ATTEMPTS) {
        break;
      }
    }
  }

  // ── Step 7.5: Check if LLM succeeded ───────────────────────────────────
  if (!agendaContent) {
    const errorMessage = `LLM failed to produce valid output after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`;
    console.error('[agenda-agent] Agent failed', {
      workflowRunId,
      errorCode: 'LLM_OUTPUT_INVALID',
      errorMessage,
      durationMs: Date.now() - startTime,
    });

    await safeUpdateStatus(apiClient, workflowRunId, 'failed', undefined, {
      code: 'LLM_OUTPUT_INVALID',
      message: errorMessage,
    });

    return {
      success: false,
      tasksAnalyzed: allTasks.length,
      tasksCompleted: completedTasks.length,
      tasksIncomplete: incompleteTasks.length,
      errorCode: 'LLM_OUTPUT_INVALID',
      errorMessage,
    };
  }

  // ── Step 8: Save draft agenda ──────────────────────────────────────────
  let agendaShortId: string;
  try {
    const saveResponse = await apiClient.createAgenda(clientId, {
      clientId,
      content: agendaContent,
      cycleStart,
      cycleEnd,
    });

    agendaShortId = saveResponse.shortId;

    console.info('[agenda-agent] Agenda saved', {
      workflowRunId,
      agendaShortId,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Agenda save failed';
    console.error('[agenda-agent] Agent failed', {
      workflowRunId,
      errorCode: 'AGENDA_SAVE_FAILED',
      errorMessage,
      durationMs: Date.now() - startTime,
    });

    await safeUpdateStatus(apiClient, workflowRunId, 'failed', undefined, {
      code: 'AGENDA_SAVE_FAILED',
      message: errorMessage,
    });

    return {
      success: false,
      tasksAnalyzed: allTasks.length,
      tasksCompleted: completedTasks.length,
      tasksIncomplete: incompleteTasks.length,
      errorCode: 'AGENDA_SAVE_FAILED',
      errorMessage,
    };
  }

  // ── Step 9: Update workflow run to 'completed' ─────────────────────────
  const completionResult = {
    agenda_short_id: agendaShortId,
    tasks_analyzed: allTasks.length,
    tasks_completed: completedTasks.length,
    tasks_incomplete: incompleteTasks.length,
  };

  await safeUpdateStatus(apiClient, workflowRunId, 'completed', completionResult);

  const durationMs = Date.now() - startTime;
  console.info('[agenda-agent] Agent completed', {
    workflowRunId,
    agendaShortId,
    tasksAnalyzed: allTasks.length,
    durationMs,
  });

  return {
    success: true,
    agendaShortId,
    tasksAnalyzed: allTasks.length,
    tasksCompleted: completedTasks.length,
    tasksIncomplete: incompleteTasks.length,
  };
}

/**
 * Safely updates workflow status without throwing.
 * Status update failures are logged but do not block the agent.
 * (FR-42: "Workflow status update fails → Log error, continue (non-blocking)")
 */
async function safeUpdateStatus(
  apiClient: any,
  workflowRunId: string,
  status: 'running' | 'completed' | 'failed',
  result?: Record<string, unknown>,
  error?: { code: string; message: string },
): Promise<void> {
  try {
    await apiClient.updateWorkflowStatus(workflowRunId, {
      status,
      result: result ?? null,
      error: error ?? null,
    });
  } catch (err) {
    console.error('[agenda-agent] Failed to update workflow status (non-blocking)', {
      workflowRunId,
      status,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
