import type { ApiErrorCode } from '@iexcel/shared-types';

/**
 * Typed error class for all API client errors.
 * Consumers can use `instanceof ApiClientError` to distinguish
 * API-level errors from other runtime errors, then switch on
 * `error.code` to handle specific cases.
 */
export class ApiClientError extends Error {
  public override readonly name = 'ApiClientError';

  constructor(
    message: string,
    public readonly code: ApiErrorCode | 'UNKNOWN_ERROR' | 'NETWORK_ERROR',
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}
