/**
 * UI-level types for the Workflow Trigger feature.
 *
 * These types represent the UI state model and map to the API contracts
 * from @iexcel/shared-types. Some fields are UI-only extensions
 * for future API enhancements (e.g., result payloads on completion).
 */

export type WorkflowType = 'intake' | 'agenda';

export type TranscriptSource = 'paste' | 'upload' | 'grain';

export type PageState = 'form' | 'processing';

/**
 * Maps shared-types WorkflowStatus to UI display status.
 * The API uses 'running'/'completed'; UI maps them to friendlier labels.
 */
export type UIWorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface FormState {
  pageState: PageState;
  workflowType: WorkflowType | null;
  clientId: string | null;
  clientName: string | null;
  // Intake inputs
  transcriptSource: TranscriptSource;
  transcriptText: string;
  uploadedFileName: string | null;
  callDate: string;
  // Agenda inputs
  cycleStart: string;
  cycleEnd: string;
  cycleAutoSuggested: boolean;
  // Processing state
  workflowRunId: string | null;
  // Submission state
  isSubmitting: boolean;
  submitError: string | null;
  noTasksWarning: string | null;
  fieldErrors: Record<string, string>;
}

export type FormAction =
  | { type: 'SET_WORKFLOW_TYPE'; payload: WorkflowType }
  | { type: 'SET_CLIENT'; payload: { clientId: string; clientName: string } }
  | { type: 'SET_TRANSCRIPT_SOURCE'; payload: TranscriptSource }
  | { type: 'SET_TRANSCRIPT_TEXT'; payload: string }
  | { type: 'SET_UPLOADED_FILE'; payload: { fileName: string; text: string } }
  | { type: 'CLEAR_UPLOADED_FILE' }
  | { type: 'SET_CALL_DATE'; payload: string }
  | { type: 'SET_CYCLE_START'; payload: string }
  | { type: 'SET_CYCLE_END'; payload: string }
  | { type: 'SET_CYCLE_DATES'; payload: { cycleStart: string; cycleEnd: string } }
  | { type: 'SET_FIELD_ERRORS'; payload: Record<string, string> }
  | { type: 'CLEAR_FIELD_ERROR'; payload: string }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_SUBMIT_ERROR'; payload: string | null }
  | { type: 'SET_NO_TASKS_WARNING'; payload: string | null }
  | { type: 'START_PROCESSING'; payload: string }
  | { type: 'RETURN_TO_FORM' };

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialFormState(): FormState {
  return {
    pageState: 'form',
    workflowType: null,
    clientId: null,
    clientName: null,
    transcriptSource: 'paste',
    transcriptText: '',
    uploadedFileName: null,
    callDate: formatDateISO(new Date()),
    cycleStart: '',
    cycleEnd: '',
    cycleAutoSuggested: false,
    workflowRunId: null,
    isSubmitting: false,
    submitError: null,
    noTasksWarning: null,
    fieldErrors: {},
  };
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_WORKFLOW_TYPE':
      return {
        ...state,
        workflowType: action.payload,
        // Clear workflow-specific fields when switching
        transcriptText: '',
        uploadedFileName: null,
        transcriptSource: 'paste',
        cycleStart: '',
        cycleEnd: '',
        cycleAutoSuggested: false,
        fieldErrors: {},
        submitError: null,
        noTasksWarning: null,
      };

    case 'SET_CLIENT':
      return {
        ...state,
        clientId: action.payload.clientId,
        clientName: action.payload.clientName,
        fieldErrors: removeKey(state.fieldErrors, 'clientId'),
        noTasksWarning: null,
      };

    case 'SET_TRANSCRIPT_SOURCE':
      return {
        ...state,
        transcriptSource: action.payload,
        transcriptText: '',
        uploadedFileName: null,
        fieldErrors: removeKey(state.fieldErrors, 'transcript'),
      };

    case 'SET_TRANSCRIPT_TEXT':
      return {
        ...state,
        transcriptText: action.payload,
        fieldErrors: removeKey(state.fieldErrors, 'transcript'),
      };

    case 'SET_UPLOADED_FILE':
      return {
        ...state,
        transcriptText: action.payload.text,
        uploadedFileName: action.payload.fileName,
        fieldErrors: removeKey(state.fieldErrors, 'transcript'),
      };

    case 'CLEAR_UPLOADED_FILE':
      return {
        ...state,
        transcriptText: '',
        uploadedFileName: null,
      };

    case 'SET_CALL_DATE':
      return {
        ...state,
        callDate: action.payload,
        fieldErrors: removeKey(state.fieldErrors, 'callDate'),
      };

    case 'SET_CYCLE_START':
      return {
        ...state,
        cycleStart: action.payload,
        cycleAutoSuggested: false,
        fieldErrors: removeKey(state.fieldErrors, 'cycleStart'),
        noTasksWarning: null,
      };

    case 'SET_CYCLE_END':
      return {
        ...state,
        cycleEnd: action.payload,
        cycleAutoSuggested: false,
        fieldErrors: removeKey(state.fieldErrors, 'cycleEnd'),
        noTasksWarning: null,
      };

    case 'SET_CYCLE_DATES':
      return {
        ...state,
        cycleStart: action.payload.cycleStart,
        cycleEnd: action.payload.cycleEnd,
        cycleAutoSuggested: true,
        fieldErrors: removeKeys(state.fieldErrors, ['cycleStart', 'cycleEnd']),
      };

    case 'SET_FIELD_ERRORS':
      return {
        ...state,
        fieldErrors: action.payload,
      };

    case 'CLEAR_FIELD_ERROR':
      return {
        ...state,
        fieldErrors: removeKey(state.fieldErrors, action.payload),
      };

    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.payload,
      };

    case 'SET_SUBMIT_ERROR':
      return {
        ...state,
        submitError: action.payload,
      };

    case 'SET_NO_TASKS_WARNING':
      return {
        ...state,
        noTasksWarning: action.payload,
      };

    case 'START_PROCESSING':
      return {
        ...state,
        pageState: 'processing',
        workflowRunId: action.payload,
        isSubmitting: false,
        submitError: null,
      };

    case 'RETURN_TO_FORM':
      return {
        ...state,
        pageState: 'form',
        workflowRunId: null,
        isSubmitting: false,
        submitError: null,
      };

    default:
      return state;
  }
}

function removeKey(
  obj: Record<string, string>,
  key: string
): Record<string, string> {
  const { [key]: _, ...rest } = obj;
  return rest;
}

function removeKeys(
  obj: Record<string, string>,
  keys: string[]
): Record<string, string> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}
