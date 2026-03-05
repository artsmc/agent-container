'use client';

import { useReducer, useCallback, useMemo } from 'react';
import type { Client } from '@iexcel/shared-types';
import { createApiClient } from '@iexcel/api-client';
import { WorkflowSelector } from '../WorkflowSelector';
import { ClientSelector } from '../ClientSelector';
import { IntakeInputs } from '../IntakeInputs';
import { AgendaInputs } from '../AgendaInputs';
import { WorkflowProgress } from '../WorkflowProgress';
import {
  formReducer,
  createInitialFormState,
  formatDateISO,
} from '@/lib/workflow/types';
import type { WorkflowType } from '@/lib/workflow/types';
import { handleFormSubmit, getSubmitLabel } from '@/lib/workflow/submit';
import styles from './WorkflowTriggerForm.module.scss';

export interface WorkflowTriggerFormProps {
  clients: Client[];
}

/**
 * Creates a browser-side API client for workflow trigger operations.
 */
function getBrowserApiClient() {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
    tokenProvider: {
      getAccessToken: async () => '',
      refreshAccessToken: async () => '',
    },
  });
}

export default function WorkflowTriggerForm({
  clients,
}: WorkflowTriggerFormProps) {
  const [state, dispatch] = useReducer(formReducer, undefined, createInitialFormState);
  const apiClient = useMemo(() => getBrowserApiClient(), []);

  const handleWorkflowTypeChange = useCallback((type: WorkflowType) => {
    dispatch({ type: 'SET_WORKFLOW_TYPE', payload: type });
  }, []);

  const fetchCycleDateSuggestion = useCallback(
    async (clientId: string) => {
      try {
        const response = await apiClient.listAgendas(clientId, { limit: 1 });
        const agendas = response.data;
        if (agendas.length > 0) {
          const lastCycleEnd = new Date(agendas[0].cycleEnd);
          const nextStart = new Date(lastCycleEnd);
          nextStart.setDate(nextStart.getDate() + 1);
          const nextEnd = new Date(nextStart);
          nextEnd.setDate(nextEnd.getDate() + 30);
          dispatch({
            type: 'SET_CYCLE_DATES',
            payload: {
              cycleStart: formatDateISO(nextStart),
              cycleEnd: formatDateISO(nextEnd),
            },
          });
        } else {
          dispatch({
            type: 'SET_CYCLE_DATES',
            payload: { cycleStart: '', cycleEnd: '' },
          });
        }
      } catch {
        dispatch({
          type: 'SET_CYCLE_DATES',
          payload: { cycleStart: '', cycleEnd: '' },
        });
      }
    },
    [apiClient]
  );

  const handleClientChange = useCallback(
    (clientId: string, clientName: string) => {
      if (!clientId) {
        dispatch({ type: 'SET_CLIENT', payload: { clientId: '', clientName: '' } });
        return;
      }
      dispatch({ type: 'SET_CLIENT', payload: { clientId, clientName } });
      if (state.workflowType === 'agenda') {
        fetchCycleDateSuggestion(clientId);
      }
    },
    [state.workflowType, fetchCycleDateSuggestion]
  );

  const handleSubmit = useCallback(async () => {
    await handleFormSubmit(state, dispatch, apiClient);
  }, [state, apiClient]);

  const handleRetry = useCallback(() => {
    dispatch({ type: 'RETURN_TO_FORM' });
  }, []);

  const getWorkflowStatus = useCallback(
    (workflowId: string) => apiClient.getWorkflowStatus(workflowId),
    [apiClient]
  );

  const submitLabel = getSubmitLabel(state.workflowType);
  const isSubmitDisabled = !state.workflowType || state.isSubmitting;

  // Processing view
  if (
    state.pageState === 'processing' &&
    state.workflowRunId &&
    state.workflowType &&
    state.clientId &&
    state.clientName
  ) {
    return (
      <WorkflowProgress
        workflowType={state.workflowType}
        clientId={state.clientId}
        clientName={state.clientName}
        workflowRunId={state.workflowRunId}
        onRetry={handleRetry}
        getWorkflowStatus={getWorkflowStatus}
      />
    );
  }

  // Form view
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      data-testid="workflow-trigger-form"
    >
      <WorkflowSelector
        selected={state.workflowType}
        onChange={handleWorkflowTypeChange}
        error={state.fieldErrors.workflowType}
      />

      <ClientSelector
        clients={clients}
        selectedId={state.clientId}
        onChange={handleClientChange}
        error={state.fieldErrors.clientId}
      />

      {state.workflowType === 'intake' && (
        <IntakeInputs
          transcriptSource={state.transcriptSource}
          onSourceChange={(source) =>
            dispatch({ type: 'SET_TRANSCRIPT_SOURCE', payload: source })
          }
          transcriptText={state.transcriptText}
          onTextChange={(text) =>
            dispatch({ type: 'SET_TRANSCRIPT_TEXT', payload: text })
          }
          fileName={state.uploadedFileName}
          onFileChange={(fileName, text) =>
            dispatch({ type: 'SET_UPLOADED_FILE', payload: { fileName, text } })
          }
          onFileClear={() => dispatch({ type: 'CLEAR_UPLOADED_FILE' })}
          callDate={state.callDate}
          onCallDateChange={(date) =>
            dispatch({ type: 'SET_CALL_DATE', payload: date })
          }
          errors={state.fieldErrors}
        />
      )}

      {state.workflowType === 'agenda' && (
        <AgendaInputs
          cycleStart={state.cycleStart}
          cycleEnd={state.cycleEnd}
          onCycleStartChange={(date) =>
            dispatch({ type: 'SET_CYCLE_START', payload: date })
          }
          onCycleEndChange={(date) =>
            dispatch({ type: 'SET_CYCLE_END', payload: date })
          }
          cycleAutoSuggested={state.cycleAutoSuggested}
          errors={state.fieldErrors}
        />
      )}

      {state.noTasksWarning && (
        <div
          className={styles.warningBanner}
          role="alert"
          data-testid="no-tasks-warning"
        >
          {state.noTasksWarning}
        </div>
      )}

      {state.submitError && (
        <div
          className={styles.errorBanner}
          role="alert"
          data-testid="submit-error"
        >
          {state.submitError}
        </div>
      )}

      <div className={styles.submitRow}>
        <button
          type="submit"
          className={`${styles.submitButton} ${
            state.isSubmitting ? styles.submitButtonLoading : ''
          }`}
          disabled={isSubmitDisabled}
          aria-disabled={isSubmitDisabled}
          data-testid="submit-button"
        >
          {state.isSubmitting ? (
            <>
              <span className={styles.submitSpinner} aria-hidden="true" />
              Submitting...
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
