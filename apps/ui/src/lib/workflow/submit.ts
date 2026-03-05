/**
 * Workflow submission handlers.
 *
 * Extracted from WorkflowTriggerForm to keep the component focused
 * on rendering while this module handles the API interaction logic.
 */

import type { ApiClient } from '@iexcel/api-client';
import { MeetingType } from '@iexcel/shared-types';
import type { FormState, FormAction, WorkflowType } from './types';
import { validateForm } from './validate';

type Dispatch = (action: FormAction) => void;

/**
 * Validates the form and dispatches the appropriate submission handler.
 */
export async function handleFormSubmit(
  state: FormState,
  dispatch: Dispatch,
  apiClient: ApiClient
): Promise<void> {
  const validation = validateForm(state);
  if (!validation.valid) {
    dispatch({ type: 'SET_FIELD_ERRORS', payload: validation.errors });
    return;
  }

  dispatch({ type: 'SET_SUBMITTING', payload: true });
  dispatch({ type: 'SET_SUBMIT_ERROR', payload: null });

  if (state.workflowType === 'intake') {
    await submitIntakeWorkflow(state, dispatch, apiClient);
  } else if (state.workflowType === 'agenda') {
    await submitAgendaWorkflow(state, dispatch, apiClient);
  }
}

/**
 * Two-step intake submission: POST transcript, then POST workflow trigger.
 */
async function submitIntakeWorkflow(
  state: FormState,
  dispatch: Dispatch,
  apiClient: ApiClient
): Promise<void> {
  const clientId = state.clientId;
  if (!clientId) return;

  // Step 1: Submit transcript
  let transcriptId: string;
  try {
    const transcriptResult = await apiClient.submitTranscript(clientId, {
      clientId,
      callType: MeetingType.Intake,
      callDate: state.callDate,
      rawTranscript: state.transcriptText,
    });
    transcriptId = transcriptResult.id;
  } catch {
    dispatch({
      type: 'SET_SUBMIT_ERROR',
      payload: 'Failed to submit transcript. Please try again.',
    });
    dispatch({ type: 'SET_SUBMITTING', payload: false });
    return;
  }

  // Step 2: Trigger workflow
  try {
    const workflowResult = await apiClient.triggerIntakeWorkflow({
      clientId,
      transcriptId,
    });
    dispatch({ type: 'START_PROCESSING', payload: workflowResult.id });
  } catch {
    dispatch({
      type: 'SET_SUBMIT_ERROR',
      payload:
        'The transcript was saved, but the workflow could not be started. Please try again.',
    });
    dispatch({ type: 'SET_SUBMITTING', payload: false });
  }
}

/**
 * Agenda submission: single POST workflow trigger.
 * Handles the 422 no-completed-tasks case as a warning.
 */
async function submitAgendaWorkflow(
  state: FormState,
  dispatch: Dispatch,
  apiClient: ApiClient
): Promise<void> {
  const clientId = state.clientId;
  if (!clientId) return;

  try {
    const workflowResult = await apiClient.triggerAgendaWorkflow({
      clientId,
      cycleStart: state.cycleStart,
      cycleEnd: state.cycleEnd,
    });
    dispatch({ type: 'START_PROCESSING', payload: workflowResult.id });
  } catch (err: unknown) {
    if (isApiNoTasksError(err)) {
      const warning = `No completed tasks were found for ${state.clientName} between ${state.cycleStart} and ${state.cycleEnd}. Please adjust the date range or verify tasks are marked as completed.`;
      dispatch({ type: 'SET_NO_TASKS_WARNING', payload: warning });
    } else {
      dispatch({
        type: 'SET_SUBMIT_ERROR',
        payload: 'Failed to trigger agenda workflow. Please try again.',
      });
    }
    dispatch({ type: 'SET_SUBMITTING', payload: false });
  }
}

/**
 * Returns the submit button label based on the selected workflow type.
 */
export function getSubmitLabel(workflowType: WorkflowType | null): string {
  switch (workflowType) {
    case 'intake':
      return 'Trigger Intake Workflow';
    case 'agenda':
      return 'Trigger Agenda Workflow';
    default:
      return 'Select a workflow to continue';
  }
}

/**
 * Checks if an API error indicates no completed tasks were found.
 * The API may return a 422 or a specific error code for this case.
 */
function isApiNoTasksError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: number }).status === 422;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: string }).message?.toLowerCase() ?? '';
    return (
      message.includes('no completed tasks') ||
      message.includes('no tasks found')
    );
  }
  return false;
}
