import type { DashboardAuditEntry } from '@/types/dashboard';
import { getApiClient } from './getApiClient';

/**
 * Fetches the 20 most recent audit log entries.
 *
 * Transforms the api-client's AuditEntry into DashboardAuditEntry,
 * filling in actor information from available fields.
 */
export async function fetchAuditLog(): Promise<DashboardAuditEntry[]> {
  const apiClient = getApiClient();

  const response = await apiClient.queryAuditLog({ limit: 20 });

  return response.data.map((entry) => {
    // TODO: The api-client AuditEntry type currently has a flat structure
    // (userId, action, entityType, entityId). Once the API is updated to
    // return actor name/avatar, client info, and workflow name, update
    // this mapping. For now we construct the best representation possible.
    const raw = entry as unknown as Record<string, unknown>;

    const actor = typeof raw.actor === 'object' && raw.actor !== null
      ? (raw.actor as { id: string; name: string; avatar_url: string | null })
      : { id: entry.userId, name: entry.userId, avatar_url: null };

    return {
      id: entry.id,
      actionType: entry.action,
      actor: {
        id: actor.id,
        name: actor.name,
        avatarUrl: actor.avatar_url,
      },
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityLabel: (raw.entity_label as string) ?? null,
      clientId: (raw.client_id as string) ?? null,
      clientName: (raw.client_name as string) ?? null,
      workflowName: (raw.workflow_name as string) ?? null,
      createdAt: entry.createdAt,
    };
  });
}
