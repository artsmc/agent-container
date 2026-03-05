/** Response shape for GET /clients/{id}/status */
export interface ClientStatusResponse {
  clientId: string;
  pendingApprovals: number;
  agendaReady: boolean;
  nextCallDate: string | null;
}

/** Query parameters for GET /audit */
export interface AuditQueryParams {
  entityType?: string;
  entityId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

/** Single audit log entry returned by GET /audit */
export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  action: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

/** Request body for POST /asana/workspaces */
export interface AddAsanaWorkspaceRequest {
  asanaWorkspaceId: string;
  name: string;
  accessToken: string;
}

/** Response for GET /clients/{id}/import/status and POST /clients/{id}/import */
export interface ImportStatusResponse {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

/** Request body for POST /clients/{id}/import */
export interface TriggerImportRequest {
  grainPlaylistId?: string;
  asanaProjectId?: string;
}

/** Request body for POST /tasks/{id}/reject */
export interface RejectTaskRequest {
  reason?: string;
}
