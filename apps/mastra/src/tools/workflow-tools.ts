/**
 * Workflow tools for the Mastra runtime.
 *
 * Provides tools for updating workflow run status via the iExcel API.
 * Shared by both the Intake Agent (Feature 19) and Agenda Agent (Feature 20).
 *
 * @see Feature 19 — Intake Agent
 * @see Feature 20 — Agenda Agent
 */
import { createTool } from '@mastra/core/tools';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';
import { getApiClient } from '../api-client.js';
import { extractToken } from '../mcp-tools/helpers/extract-token.js';
import { createUserApiClient } from '../mcp-tools/helpers/create-user-api-client.js';

// ── updateWorkflowStatusTool ──────────────────────────────────────────────────

const updateWorkflowStatusInputSchema = z.object({
  workflowRunId: z.string().uuid().describe('UUID of the workflow run record'),
  status: z
    .enum(['running', 'completed', 'failed'])
    .describe('New status for the workflow run'),
  result: z
    .record(z.unknown())
    .nullable()
    .optional()
    .describe('Result payload for completed workflows (shape varies by workflow type)'),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable()
    .optional()
    .describe('Error payload for failed workflows'),
});

const updateWorkflowStatusOutputSchema = z.object({
  updated: z.boolean(),
});

export const updateWorkflowStatusTool = createTool({
  id: 'update-workflow-status',
  description:
    'Updates the status of a workflow run. Used to report progress, completion, or failure.',
  inputSchema: updateWorkflowStatusInputSchema,
  outputSchema: updateWorkflowStatusOutputSchema,
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    const apiClient = userToken ? createUserApiClient(userToken) : getApiClient();
    // The API accepts the result/error payloads as-is; the specific shape
    // varies by workflow type (intake vs agenda). We cast to unknown first
    // because the Zod schema already validates the input structure.
    await apiClient.updateWorkflowStatus(input.workflowRunId, {
      status: input.status,
      result: input.result,
      error: input.error,
    } as Parameters<typeof apiClient.updateWorkflowStatus>[1]);
    return { updated: true };
  },
});
