import type { AsanaWorkspace } from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';
import type { AddAsanaWorkspaceRequest } from '../types/additional';

/**
 * Asana workspace endpoint methods.
 */
export function createAsanaEndpoints(http: HttpTransport) {
  return {
    /**
     * List all configured Asana workspaces.
     * GET /asana/workspaces
     */
    listAsanaWorkspaces(): Promise<AsanaWorkspace[]> {
      return http.request({
        method: 'GET',
        path: '/asana/workspaces',
      });
    },

    /**
     * Add a new Asana workspace configuration.
     * POST /asana/workspaces
     */
    addAsanaWorkspace(body: AddAsanaWorkspaceRequest): Promise<AsanaWorkspace> {
      return http.request({
        method: 'POST',
        path: '/asana/workspaces',
        body,
      });
    },

    /**
     * Delete an Asana workspace configuration.
     * DELETE /asana/workspaces/{id}
     */
    deleteAsanaWorkspace(workspaceId: string): Promise<void> {
      return http.request({
        method: 'DELETE',
        path: `/asana/workspaces/${workspaceId}`,
      });
    },
  };
}

export type AsanaEndpoints = ReturnType<typeof createAsanaEndpoints>;
