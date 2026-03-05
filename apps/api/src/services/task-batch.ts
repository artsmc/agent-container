import type { DbClient } from '../db/client';
import { ApiError, BusinessError } from '../errors/api-errors';
import { approveTask, pushTask } from './task-transitions';
import type { BatchItemResult, BatchOperationResponse } from './task-types';

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

/**
 * Batch approve tasks. Each task is processed independently.
 * Always returns HTTP 200 with per-item results.
 */
export async function batchApprove(
  db: DbClient,
  taskIds: string[],
  userId: string,
  userRole: string,
  source: 'agent' | 'ui' | 'terminal'
): Promise<BatchOperationResponse> {
  const results: BatchItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const taskIdParam of taskIds) {
    try {
      const detail = await approveTask(db, taskIdParam, userId, userRole, source);
      results.push({ task_id: taskIdParam, success: true, task: detail });
      succeeded++;
    } catch (err) {
      failed++;
      if (err instanceof BusinessError) {
        results.push({
          task_id: taskIdParam,
          success: false,
          error: {
            code: err.code,
            message: err.message,
            ...err.details,
          },
        });
      } else if (err instanceof ApiError) {
        results.push({
          task_id: taskIdParam,
          success: false,
          error: { code: err.code, message: err.message },
        });
      } else {
        results.push({
          task_id: taskIdParam,
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : 'Unknown error',
          },
        });
      }
    }
  }

  return {
    results,
    summary: { total: taskIds.length, succeeded, failed },
  };
}

/**
 * Batch push tasks. Each task is processed independently.
 * Always returns HTTP 200 with per-item results.
 */
export async function batchPush(
  db: DbClient,
  taskIds: string[],
  userId: string,
  userRole: string,
  source: 'agent' | 'ui' | 'terminal'
): Promise<BatchOperationResponse> {
  const results: BatchItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const taskIdParam of taskIds) {
    try {
      const detail = await pushTask(db, taskIdParam, userId, userRole, source);
      results.push({ task_id: taskIdParam, success: true, task: detail });
      succeeded++;
    } catch (err) {
      failed++;
      if (err instanceof BusinessError) {
        results.push({
          task_id: taskIdParam,
          success: false,
          error: {
            code: err.code,
            message: err.message,
            ...err.details,
          },
        });
      } else if (err instanceof ApiError) {
        results.push({
          task_id: taskIdParam,
          success: false,
          error: { code: err.code, message: err.message },
        });
      } else {
        results.push({
          task_id: taskIdParam,
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : 'Unknown error',
          },
        });
      }
    }
  }

  return {
    results,
    summary: { total: taskIds.length, succeeded, failed },
  };
}
