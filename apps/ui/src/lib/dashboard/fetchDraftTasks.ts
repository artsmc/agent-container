import type { TaskStatus } from '@iexcel/shared-types';
import type { DashboardClient, DashboardDraftTask, DraftTasksResult } from '@/types/dashboard';
import { getApiClient } from './getApiClient';
import { parseIsoDurationToMinutes } from './parseIsoDuration';

/**
 * Fetches draft tasks across all clients in parallel.
 *
 * Uses `Promise.allSettled` so a failure for one client does not
 * block tasks from other clients. Returns the merged, sorted list
 * and a flag indicating whether any client fetch failed.
 */
export async function fetchDraftTasks(
  clients: DashboardClient[]
): Promise<DraftTasksResult> {
  const apiClient = getApiClient();

  const results = await Promise.allSettled(
    clients.map((client) =>
      apiClient
        .listTasks(client.id, { status: 'draft' as TaskStatus })
        .then((response) =>
          response.data.map(
            (task): DashboardDraftTask => ({
              shortId: task.shortId as string,
              clientId: task.clientId,
              clientName: client.name,
              title: task.title,
              estimatedMinutes: parseIsoDurationToMinutes(task.estimatedTime),
            })
          )
        )
    )
  );

  const tasks: DashboardDraftTask[] = [];
  let hadErrors = false;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      tasks.push(...result.value);
    } else {
      hadErrors = true;
    }
  }

  // Sort by short_id ascending (lexicographic on the string works for TSK-NNNN)
  tasks.sort((a, b) => a.shortId.localeCompare(b.shortId));

  return { tasks, hadErrors };
}
