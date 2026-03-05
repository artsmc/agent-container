import type {
  NormalizedTask,
  GetTasksRequest,
  GetTasksResponse,
  GetTaskResponse,
  CreateTaskRequest,
  UpdateTaskRequest,
  ApproveTasksRequest,
  PushTasksRequest,
  BatchOperationResponse,
} from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';
import type { RejectTaskRequest } from '../types/additional';

/**
 * Task endpoint methods.
 * All task methods accept either a UUID or short ID (e.g., TSK-0042)
 * as the taskId parameter. The API resolves short IDs transparently.
 */
export function createTaskEndpoints(http: HttpTransport) {
  return {
    /**
     * List tasks for a client with optional filtering and pagination.
     * GET /clients/{id}/tasks
     */
    listTasks(
      clientId: string,
      params?: GetTasksRequest
    ): Promise<GetTasksResponse> {
      return http.request({
        method: 'GET',
        path: `/clients/${clientId}/tasks`,
        params: params as Record<string, string | number | boolean | undefined | null>,
      });
    },

    /**
     * Create one or more tasks for a client.
     * POST /clients/{id}/tasks
     */
    createTasks(
      clientId: string,
      body: CreateTaskRequest | CreateTaskRequest[]
    ): Promise<NormalizedTask[]> {
      return http.request({
        method: 'POST',
        path: `/clients/${clientId}/tasks`,
        body,
      });
    },

    /**
     * Get a single task by UUID or short ID. Includes version history.
     * GET /tasks/{id}
     */
    getTask(taskId: string): Promise<GetTaskResponse> {
      return http.request({ method: 'GET', path: `/tasks/${taskId}` });
    },

    /**
     * Update a task's editable fields.
     * PATCH /tasks/{id}
     */
    updateTask(taskId: string, body: UpdateTaskRequest): Promise<NormalizedTask> {
      return http.request({
        method: 'PATCH',
        path: `/tasks/${taskId}`,
        body,
      });
    },

    /**
     * Approve a task, transitioning it from draft to approved.
     * POST /tasks/{id}/approve
     */
    approveTask(taskId: string): Promise<NormalizedTask> {
      return http.request({
        method: 'POST',
        path: `/tasks/${taskId}/approve`,
      });
    },

    /**
     * Reject a task with an optional reason.
     * POST /tasks/{id}/reject
     */
    rejectTask(taskId: string, body?: RejectTaskRequest): Promise<NormalizedTask> {
      return http.request({
        method: 'POST',
        path: `/tasks/${taskId}/reject`,
        body,
      });
    },

    /**
     * Push an approved task to the external PM system.
     * POST /tasks/{id}/push
     */
    pushTask(taskId: string): Promise<NormalizedTask> {
      return http.request({
        method: 'POST',
        path: `/tasks/${taskId}/push`,
      });
    },

    /**
     * Batch approve multiple tasks for a client.
     * POST /clients/{id}/tasks/approve
     */
    batchApproveTasks(
      clientId: string,
      body: ApproveTasksRequest
    ): Promise<BatchOperationResponse> {
      return http.request({
        method: 'POST',
        path: `/clients/${clientId}/tasks/approve`,
        body,
      });
    },

    /**
     * Batch push multiple approved tasks for a client.
     * POST /clients/{id}/tasks/push
     */
    batchPushTasks(
      clientId: string,
      body: PushTasksRequest
    ): Promise<BatchOperationResponse> {
      return http.request({
        method: 'POST',
        path: `/clients/${clientId}/tasks/push`,
        body,
      });
    },
  };
}

export type TaskEndpoints = ReturnType<typeof createTaskEndpoints>;
