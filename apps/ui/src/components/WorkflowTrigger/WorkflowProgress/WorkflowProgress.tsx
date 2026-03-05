'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkflowStatusResponse } from '@iexcel/shared-types';
import { useWorkflowPoller } from '@/lib/workflow/poll';
import type { WorkflowType, UIWorkflowStatus } from '@/lib/workflow/types';
import styles from './WorkflowProgress.module.scss';

export interface WorkflowProgressProps {
  workflowType: WorkflowType;
  clientId: string;
  clientName: string;
  workflowRunId: string;
  onRetry: () => void;
  getWorkflowStatus: (workflowId: string) => Promise<WorkflowStatusResponse>;
}

function getStatusText(
  status: UIWorkflowStatus,
  workflowType: WorkflowType
): string {
  switch (status) {
    case 'pending':
      return 'Preparing...';
    case 'running':
      return workflowType === 'intake'
        ? 'Processing transcript...'
        : 'Building agenda...';
    case 'completed':
      return 'Complete! Redirecting...';
    case 'failed':
      return 'The workflow could not be completed.';
    default:
      return 'Processing...';
  }
}

export default function WorkflowProgress({
  workflowType,
  clientId,
  clientName,
  workflowRunId,
  onRetry,
  getWorkflowStatus,
}: WorkflowProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState<UIWorkflowStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  const handleStatusUpdate = useCallback(
    (response: WorkflowStatusResponse) => {
      const uiStatus = response.status as UIWorkflowStatus;
      setStatus(uiStatus);

      if (uiStatus === 'completed' || uiStatus === 'failed') {
        setPollingEnabled(false);
      }

      if (uiStatus === 'failed' && response.error) {
        setErrorMessage(response.error);
      }
    },
    []
  );

  const handlePollingError = useCallback((error: Error) => {
    console.error('[WorkflowProgress] Polling error:', error.message);
    setStatus('failed');
    setErrorMessage('Unable to check workflow status. Please try again.');
    setPollingEnabled(false);
  }, []);

  useWorkflowPoller({
    workflowRunId,
    enabled: pollingEnabled,
    intervalMs: 3000,
    onStatusUpdate: handleStatusUpdate,
    onError: handlePollingError,
    getWorkflowStatus,
  });

  // Auto-navigate on completion after a brief delay
  useEffect(() => {
    if (status !== 'completed') return;

    const timer = setTimeout(() => {
      if (workflowType === 'intake') {
        router.push(`/clients/${clientId}/tasks`);
      } else {
        // For agenda, navigate to agendas listing for the client.
        // The exact agenda short_id would come from an extended API response.
        router.push(`/clients/${clientId}/agendas`);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [status, workflowType, clientId, router]);

  const isActive = status === 'pending' || status === 'running';
  const isFailed = status === 'failed';
  const isComplete = status === 'completed';
  const workflowLabel =
    workflowType === 'intake' ? 'Intake Workflow' : 'Agenda Workflow';

  return (
    <div
      className={styles.progressContainer}
      data-testid="workflow-progress"
    >
      <p className={styles.workflowLabel}>{workflowLabel}</p>
      <p className={styles.clientLabel}>Client: {clientName}</p>

      {isActive && (
        <div
          className={styles.spinner}
          role="status"
          aria-label="Workflow in progress"
          data-testid="workflow-spinner"
        />
      )}

      {isComplete && (
        <div
          className={styles.successIcon}
          aria-hidden="true"
          data-testid="workflow-success-icon"
        >
          &#10003;
        </div>
      )}

      {isFailed && (
        <div
          className={styles.errorIcon}
          aria-hidden="true"
          data-testid="workflow-error-icon"
        >
          !
        </div>
      )}

      <p
        className={`${styles.statusText} ${
          isFailed ? styles.statusError : ''
        } ${isComplete ? styles.statusSuccess : ''}`}
        aria-live="polite"
        data-testid="workflow-status-text"
      >
        {getStatusText(status, workflowType)}
      </p>

      {isFailed && errorMessage && (
        <p className={styles.statusDetail} data-testid="workflow-error-detail">
          {errorMessage}
        </p>
      )}

      {isFailed && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.retryButton}
            onClick={onRetry}
            data-testid="workflow-retry-button"
          >
            Try Again
          </button>
          <button
            type="button"
            className={styles.dashboardButton}
            onClick={() => router.push('/')}
            data-testid="workflow-dashboard-button"
          >
            Return to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
