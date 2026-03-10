import type {
  Client,
  PaginationParams,
  PaginatedResponse,
  CreateClientRequest,
  UpdateClientRequest,
} from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';
import type { ClientStatusResponse } from '../types/additional';

/**
 * Client endpoint methods.
 */
export function createClientEndpoints(http: HttpTransport) {
  return {
    /**
     * List all clients with optional pagination.
     * GET /clients
     */
    listClients(params?: PaginationParams): Promise<PaginatedResponse<Client>> {
      return http.request({
        method: 'GET',
        path: '/clients',
        params: params as Record<string, string | number | boolean | undefined | null>,
      });
    },

    /**
     * Create a new client.
     * POST /clients
     */
    createClient(body: CreateClientRequest): Promise<Client> {
      return http.request({
        method: 'POST',
        path: '/clients',
        body,
      });
    },

    /**
     * Get a single client by ID.
     * GET /clients/{id}
     */
    getClient(clientId: string): Promise<Client> {
      return http.request({ method: 'GET', path: `/clients/${clientId}` });
    },

    /**
     * Update a client's details.
     * PATCH /clients/{id}
     */
    updateClient(clientId: string, body: UpdateClientRequest): Promise<Client> {
      return http.request({
        method: 'PATCH',
        path: `/clients/${clientId}`,
        body,
      });
    },

    /**
     * Get a client's dashboard status.
     * GET /clients/{id}/status
     */
    getClientStatus(clientId: string): Promise<ClientStatusResponse> {
      return http.request({
        method: 'GET',
        path: `/clients/${clientId}/status`,
      });
    },
  };
}

export type ClientEndpoints = ReturnType<typeof createClientEndpoints>;
