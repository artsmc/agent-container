import type { PaginatedResponse } from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';
import type { AuditEntry, AuditQueryParams } from '../types/additional';

/**
 * Maps camelCase AuditQueryParams to the API's snake_case query parameters.
 */
function mapAuditParams(
  params: AuditQueryParams
): Record<string, string | number | undefined> {
  return {
    entity_type: params.entityType,
    entity_id: params.entityId,
    user_id: params.userId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    page: params.page,
    limit: params.limit,
  };
}

/**
 * Audit log endpoint methods.
 */
export function createAuditEndpoints(http: HttpTransport) {
  return {
    /**
     * Query the audit log with optional filters.
     * GET /audit
     */
    queryAuditLog(
      params: AuditQueryParams
    ): Promise<PaginatedResponse<AuditEntry>> {
      return http.request({
        method: 'GET',
        path: '/audit',
        params: mapAuditParams(params),
      });
    },
  };
}

export type AuditEndpoints = ReturnType<typeof createAuditEndpoints>;
