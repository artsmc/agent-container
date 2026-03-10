import { cache } from 'react';
import type { NormalizedTask } from '@iexcel/shared-types';
import type { DashboardClient } from '@/types/dashboard';
import { getApiClient } from './getApiClient';
import { fetchClients } from './fetchClients';

export interface AllTasksResult {
  tasks: (NormalizedTask & { clientName: string })[];
  hadErrors: boolean;
}

/**
 * Fetches all tasks across all accessible clients.
 *
 * Fans out requests per client using `Promise.allSettled` so a single
 * client failure does not block the rest.
 */
export const fetchAllTasks = cache(
  async (statusFilter?: string): Promise<AllTasksResult> => {
    const clients = await fetchClients();
    const apiClient = getApiClient();

    const results = await Promise.allSettled(
      clients.map((client) =>
        apiClient
          .listTasks(client.id, {
            limit: 100,
            ...(statusFilter ? { status: statusFilter as any } : {}),
          })
          .then((response) =>
            response.data.map((task) => ({
              ...task,
              clientName: client.name,
            }))
          )
      )
    );

    const tasks: (NormalizedTask & { clientName: string })[] = [];
    let hadErrors = false;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        tasks.push(...result.value);
      } else {
        hadErrors = true;
      }
    }

    // Sort by createdAt descending (newest first)
    tasks.sort((a, b) => {
      const aDate = (a as any).createdAt ?? (a as any).created_at ?? '';
      const bDate = (b as any).createdAt ?? (b as any).created_at ?? '';
      return bDate.localeCompare(aDate);
    });

    return { tasks, hadErrors };
  }
);
