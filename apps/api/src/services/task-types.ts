// ---------------------------------------------------------------------------
// Type definitions for the task service layer
// ---------------------------------------------------------------------------

/**
 * API response shape for a task summary (used in list endpoints).
 * Does NOT include versions array.
 */
export interface TaskSummaryResponse {
  id: string;
  short_id: string;
  client_id: string;
  transcript_id: string | null;
  status: string;
  title: string;
  description: unknown;
  assignee: string | null;
  estimated_time: string | null;
  scrum_stage: string;
  external_ref: ExternalRefResponse | null;
  approved_by: string | null;
  approved_at: string | null;
  pushed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * API response shape for a full task detail (includes versions).
 */
export interface TaskDetailResponse extends TaskSummaryResponse {
  versions: TaskVersionResponse[];
}

/**
 * API response shape for a task version.
 */
export interface TaskVersionResponse {
  id: string;
  version: number;
  title: string;
  description: unknown;
  estimated_time: string | null;
  edited_by: string | null;
  source: string;
  created_at: string;
}

/**
 * External reference shape for API responses.
 */
export interface ExternalRefResponse {
  system: string;
  externalId: string | null;
  externalUrl: string | null;
  workspaceId: string | null;
  projectId: string | null;
}

/**
 * Workspace configuration resolved by the routing cascade.
 */
export interface WorkspaceConfig {
  workspaceId: string;
  projectId: string | null;
}

/**
 * Normalized task payload for the output normalizer (Feature 12).
 */
export interface NormalizedTaskPayload {
  title: string;
  description: string;
  assignee: string | null;
  estimated_time: string | null;
  scrum_stage: string;
  client_name: string;
}

/**
 * Result shape for a single batch operation item.
 */
export interface BatchItemResult {
  task_id: string;
  success: boolean;
  task?: TaskDetailResponse;
  error?: {
    code: string;
    message: string;
    [key: string]: unknown;
  };
}

/**
 * Response shape for batch operations.
 */
export interface BatchOperationResponse {
  results: BatchItemResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}
