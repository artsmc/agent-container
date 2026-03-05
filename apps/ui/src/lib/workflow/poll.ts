'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { WorkflowStatusResponse } from '@iexcel/shared-types';

export interface UseWorkflowPollerOptions {
  workflowRunId: string | null;
  enabled: boolean;
  intervalMs?: number;
  onStatusUpdate: (status: WorkflowStatusResponse) => void;
  onError: (error: Error) => void;
  getWorkflowStatus: (workflowId: string) => Promise<WorkflowStatusResponse>;
}

/**
 * Polls the workflow status API at a configurable interval.
 *
 * - Fires an immediate first poll (no initial delay).
 * - Clears interval on unmount via useEffect cleanup.
 * - Caller is responsible for stopping polling by setting enabled=false
 *   when a terminal status is reached.
 */
export function useWorkflowPoller({
  workflowRunId,
  enabled,
  intervalMs = 3000,
  onStatusUpdate,
  onError,
  getWorkflowStatus,
}: UseWorkflowPollerOptions): void {
  const onStatusUpdateRef = useRef(onStatusUpdate);
  const onErrorRef = useRef(onError);
  const getWorkflowStatusRef = useRef(getWorkflowStatus);

  // Keep refs current without triggering effect re-runs
  useEffect(() => {
    onStatusUpdateRef.current = onStatusUpdate;
  }, [onStatusUpdate]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    getWorkflowStatusRef.current = getWorkflowStatus;
  }, [getWorkflowStatus]);

  const poll = useCallback(async (id: string) => {
    try {
      const status = await getWorkflowStatusRef.current(id);
      onStatusUpdateRef.current(status);
    } catch (err) {
      onErrorRef.current(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    if (!enabled || !workflowRunId) return;

    // Immediate first poll
    poll(workflowRunId);

    const intervalId = setInterval(() => {
      poll(workflowRunId);
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [workflowRunId, enabled, intervalMs, poll]);
}
