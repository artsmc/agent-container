import type { NormalizedTask, TaskVersion, TaskStatus, CreateTaskRequest, UpdateTaskRequest } from './task';
import type { Agenda, AgendaVersion, CreateAgendaRequest, UpdateAgendaRequest } from './agenda';
import type { Client, EmailRecipients } from './client';
import type { ProductUser } from './auth';
import type { MeetingType } from './transcript';

export enum ApiErrorCode {
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  ClientNotFound = 'CLIENT_NOT_FOUND',
  TaskNotFound = 'TASK_NOT_FOUND',
  AgendaNotFound = 'AGENDA_NOT_FOUND',
  TranscriptNotFound = 'TRANSCRIPT_NOT_FOUND',
  TaskNotApprovable = 'TASK_NOT_APPROVABLE',
  AgendaNotFinalizable = 'AGENDA_NOT_FINALIZABLE',
  PushFailed = 'PUSH_FAILED',
  WorkspaceNotConfigured = 'WORKSPACE_NOT_CONFIGURED',
  ValidationError = 'VALIDATION_ERROR',
  InternalError = 'INTERNAL_ERROR',
  InvalidId = 'INVALID_ID',
  InvalidBody = 'INVALID_BODY',
  InvalidPagination = 'INVALID_PAGINATION',

  // Grain normalizer error codes (Feature 37)
  GrainRecordingNotFound = 'GRAIN_RECORDING_NOT_FOUND',
  GrainAccessDenied = 'GRAIN_ACCESS_DENIED',
  GrainTranscriptUnavailable = 'GRAIN_TRANSCRIPT_UNAVAILABLE',
  GrainApiError = 'GRAIN_API_ERROR',

  // Historical import error codes (Feature 38)
  ImportRecordReadOnly = 'IMPORT_RECORD_READ_ONLY',
  ImportInProgress = 'IMPORT_IN_PROGRESS',
  ImportJobNotFound = 'IMPORT_JOB_NOT_FOUND',
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// --- Task Contracts ---

export interface GetTasksRequest extends PaginationParams {
  status?: TaskStatus;
  transcriptId?: string;
}

export interface GetTasksResponse extends PaginatedResponse<NormalizedTask> {}

export interface GetTaskResponse {
  task: NormalizedTask;
  versions: TaskVersion[];
}

export interface ApproveTasksRequest {
  taskIds: string[];
}

export interface PushTasksRequest {
  taskIds: string[];
}

export interface BatchOperationResponse {
  succeeded: string[];
  failed: Array<{ id: string; error: ApiError }>;
}

// Re-export request types from task module for convenience
export type { CreateTaskRequest, UpdateTaskRequest };

// --- Agenda Contracts ---

export interface GetAgendasResponse extends PaginatedResponse<Agenda> {}

export interface GetAgendaResponse {
  agenda: Agenda;
  versions: AgendaVersion[];
}

export interface ShareAgendaResponse {
  sharedUrl: string;
  internalUrl: string;
}

export interface EmailAgendaRequest {
  recipients?: EmailRecipients;
}

export interface ExportAgendaResponse {
  googleDocId: string;
  googleDocUrl: string;
}

// Re-export request types from agenda module for convenience
export type { CreateAgendaRequest, UpdateAgendaRequest };

// --- Transcript Contracts ---

export interface SubmitTranscriptRequest {
  clientId: string;
  callType: MeetingType;
  /** ISO 8601 datetime string */
  callDate: string;
  /** Full transcript text. Required if grainCallId is not provided. */
  rawTranscript?: string;
  /** Grain recording ID. Required if rawTranscript is not provided. */
  grainCallId?: string;
}

export interface GetTranscriptResponse {
  id: string;
  clientId: string;
  grainCallId: string | null;
  callType: MeetingType;
  callDate: string;
  rawTranscript: string;
  processedAt: string | null;
  createdAt: string;
}

// --- Workflow Contracts ---

export interface TriggerIntakeWorkflowRequest {
  clientId: string;
  transcriptId: string;
}

export interface TriggerAgendaWorkflowRequest {
  clientId: string;
  /** ISO 8601 date string */
  cycleStart: string;
  /** ISO 8601 date string */
  cycleEnd: string;
}

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowStatusResponse {
  id: string;
  status: WorkflowStatus;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

// --- Auth Contracts ---

export interface GetCurrentUserResponse {
  user: ProductUser;
}

// Re-export client types for convenience
export type { Client };
