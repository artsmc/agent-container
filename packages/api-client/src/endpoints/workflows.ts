import type {
  TriggerIntakeWorkflowRequest,
  TriggerAgendaWorkflowRequest,
  WorkflowStatusResponse,
} from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';

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
  };
}

export type WorkflowEndpoints = ReturnType<typeof createWorkflowEndpoints>;
