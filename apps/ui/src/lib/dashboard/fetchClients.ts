import { cache } from 'react';
import type { DashboardClient } from '@/types/dashboard';
import { getApiClient } from './getApiClient';

/**
 * Fetches the client list accessible to the authenticated user.
 *
 * Wrapped with React `cache()` for request deduplication -- multiple
 * Server Components calling this in the same render pass result in a
 * single HTTP request.
 */
export const fetchClients = cache(async (): Promise<DashboardClient[]> => {
  const apiClient = getApiClient();
  const response = await apiClient.listClients();

  return response.data.map((client) => ({
    id: client.id,
    name: client.name,
  }));
});
