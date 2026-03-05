import type { HttpTransport } from '../core/http';
import type { ImportStatusResponse, TriggerImportRequest } from '../types/additional';

/**
 * Client import endpoint methods.
 */
export function createImportEndpoints(http: HttpTransport) {
  return {
    /**
     * Trigger an import job for a client.
     * POST /clients/{id}/import
     */
    triggerImport(
      clientId: string,
      body: TriggerImportRequest
    ): Promise<ImportStatusResponse> {
      return http.request({
        method: 'POST',
        path: `/clients/${clientId}/import`,
        body,
      });
    },

    /**
     * Get the current import status for a client.
     * GET /clients/{id}/import/status
     */
    getImportStatus(clientId: string): Promise<ImportStatusResponse> {
      return http.request({
        method: 'GET',
        path: `/clients/${clientId}/import/status`,
      });
    },
  };
}

export type ImportEndpoints = ReturnType<typeof createImportEndpoints>;
