import type {
  TriggerIntakeWorkflowRequest,
  TriggerAgendaWorkflowRequest,
  WorkflowStatusResponse,
} from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';

/**
 * Request body for updating a workflow run's status.
 * Used by Mastra agents to report progress and completion.
 */
export interface UpdateWorkflowStatusRequest {
  status: 'running' | 'completed' | 'failed';
  result?: {
    task_short_ids: string[];
    tasks_attempted: number;
    tasks_created: number;
    tasks_failed: number;
    explanation?: string;
  } | null;
  error?: {
    code: string;
    message: string;
  } | null;
}

/**
 * Workflow endpoint methods.
 */
export function createWorkflowEndpoints(http: HttpTransport) {
  return {
    /**
     * Trigger the intake workflow for a client transcript.
     * POST /workflows/intake
     */
    triggerIntakeWorkflow(
      body: TriggerIntakeWorkflowRequest
    ): Promise<WorkflowStatusResponse> {
      return http.request({
        method: 'POST',
        path: '/workflows/intake',
        body,
      });
    },

    /**
     * Trigger the agenda generation workflow for a client cycle.
     * POST /workflows/agenda
     */
    triggerAgendaWorkflow(
      body: TriggerAgendaWorkflowRequest
    ): Promise<WorkflowStatusResponse> {
      return http.request({
        method: 'POST',
        path: '/workflows/agenda',
        body,
      });
    },

    /**
     * Get the status of a running workflow.
     * GET /workflows/{id}/status
     */
    getWorkflowStatus(workflowId: string): Promise<WorkflowStatusResponse> {
      return http.request({
        method: 'GET',
        path: `/workflows/${workflowId}/status`,
      });
    },

    /**
     * Update the status of a workflow run.
     * PATCH /workflows/{id}/status
     * Used by Mastra agents to report progress and completion.
     */
    updateWorkflowStatus(
      workflowId: string,
      body: UpdateWorkflowStatusRequest
    ): Promise<WorkflowStatusResponse> {
      return http.request({
        method: 'PATCH',
        path: `/workflows/${workflowId}/status`,
        body,
      });
    },
  };
}

export type WorkflowEndpoints = ReturnType<typeof createWorkflowEndpoints>;
