import type { DashboardAuditEntry } from '@/types/dashboard';

/**
 * Converts an audit entry into a human-readable action description.
 *
 * Handles all 7 known action types plus a generic fallback for unknown types.
 */
export function formatActionDescription(entry: DashboardAuditEntry): string {
  switch (entry.actionType) {
    case 'task.approved':
      return `Approved task ${entry.entityId}`;
    case 'task.rejected':
      return `Rejected task ${entry.entityId}`;
    case 'task.pushed':
      return `Pushed task ${entry.entityId} to Asana`;
    case 'agenda.shared':
      return `Shared agenda ${entry.entityId} with client ${entry.clientName ?? 'Unknown'}`;
    case 'agenda.finalized':
      return `Finalized agenda ${entry.entityId}`;
    case 'email.sent':
      return `Sent email for agenda ${entry.entityId}`;
    case 'workflow.triggered':
      return `Triggered ${entry.workflowName ?? 'workflow'} for ${entry.clientName ?? 'Unknown'}`;
    default:
      return `Performed action on ${entry.entityType} ${entry.entityId}`;
  }
}
