import type { DashboardClientStatus, AgendaStatus } from '@/types/dashboard';
import { getApiClient } from './getApiClient';

/**
 * Fetches status for each client in parallel using `Promise.allSettled`.
 *
 * If a single client's status fails, that entry is `null` in the result
 * map -- the card can still render with dashes.
 */
export async function fetchClientStatuses(
  clientIds: string[]
): Promise<Record<string, DashboardClientStatus | null>> {
  const apiClient = getApiClient();

  const results = await Promise.allSettled(
    clientIds.map((id) => apiClient.getClientStatus(id))
  );

  return Object.fromEntries(
    clientIds.map((id, i) => {
      const result = results[i];
      if (result.status === 'rejected') {
        return [id, null];
      }

      const raw = result.value;
      return [
        id,
        {
          clientId: raw.clientId,
          pendingDraftCount: raw.pendingApprovals,
          // TODO: The API currently returns `agendaReady: boolean`.
          // Once the API is updated to return a full agenda_status enum
          // (draft | in_review | finalized | shared), remove this mapping.
          agendaStatus: mapAgendaStatus(raw.agendaReady),
          nextCallDate: raw.nextCallDate,
        } satisfies DashboardClientStatus,
      ];
    })
  );
}

/**
 * Temporary mapping from the boolean `agendaReady` flag to a display status.
 * This will be replaced once the API returns the full enum.
 */
function mapAgendaStatus(agendaReady: boolean): AgendaStatus | null {
  // TODO: Replace with direct enum when API contract is updated
  return agendaReady ? 'finalized' : 'draft';
}
