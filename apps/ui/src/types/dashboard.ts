/**
 * Dashboard-local TypeScript types.
 *
 * TODO: Migrate to packages/shared-types once these stabilize and are
 * shared across the API and UI layers (see Feature 01).
 */

/** Agenda lifecycle status for a client's current cycle. */
export type AgendaStatus = 'draft' | 'in_review' | 'finalized' | 'shared';

/** Simplified client representation for dashboard cards. */
export interface DashboardClient {
  id: string;
  name: string;
}

/** Client cycle status for a single dashboard card. */
export interface DashboardClientStatus {
  clientId: string;
  pendingDraftCount: number;
  agendaStatus: AgendaStatus | null;
  nextCallDate: string | null;
}

/** A draft task displayed in the pending approvals panel. */
export interface DashboardDraftTask {
  shortId: string;
  clientId: string;
  clientName: string;
  title: string;
  estimatedMinutes: number | null;
}

/** Result of fetching draft tasks across all clients. */
export interface DraftTasksResult {
  tasks: DashboardDraftTask[];
  hadErrors: boolean;
}

/** An entry in the recent activity feed. */
export interface DashboardAuditEntry {
  id: string;
  actionType: string;
  actor: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  clientId: string | null;
  clientName: string | null;
  workflowName: string | null;
  createdAt: string;
}
