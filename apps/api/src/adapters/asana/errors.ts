import { ApiErrorCode } from '@iexcel/shared-types';

/**
 * Typed error class for the Asana output adapter.
 *
 * All errors thrown by adapter sub-modules are instances of this class.
 * The error handler middleware can use `code` and `httpStatus` to build
 * the API error response envelope.
 */
export class AdapterError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
