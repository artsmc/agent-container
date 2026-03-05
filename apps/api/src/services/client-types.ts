// ---------------------------------------------------------------------------
// Type definitions for client service layer
// ---------------------------------------------------------------------------

export interface ClientRecord {
  id: string;
  name: string;
  grain_playlist_id: string | null;
  default_asana_workspace_id: string | null;
  default_asana_project_id: string | null;
  email_recipients: EmailRecipientRecord[];
  created_at: string;
  updated_at: string;
}

export interface EmailRecipientRecord {
  name: string;
  email: string;
  role?: string;
}

export interface ListClientsResult {
  rows: ClientRecord[];
  total: number;
}

export interface TaskCounts {
  total: number;
  draft: number;
  pending_approval: number;
  approved: number;
  pushed: number;
  rejected: number;
}

export interface AgendaSummary {
  id: string;
  short_id: string;
  status: string;
  cycle_start: string | null;
  cycle_end: string | null;
  updated_at: string;
}

export interface ClientStatusResult {
  client_id: string;
  client_name: string;
  tasks: TaskCounts;
  agenda: {
    current: AgendaSummary | null;
    is_ready_to_share: boolean;
  };
  next_call: null;
}

export interface AuditLogEntry {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  source: 'agent' | 'ui' | 'terminal';
}
