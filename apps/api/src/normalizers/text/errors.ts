import { ApiErrorCode } from '@iexcel/shared-types';

/**
 * Custom error class for normalizer validation failures.
 * Caught by the API error handler and formatted into the standard error envelope.
 */
export class NormalizerError extends Error {
  readonly code: ApiErrorCode;
  readonly field?: string;

  constructor(code: ApiErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'NormalizerError';
    this.code = code;
    this.field = field;
  }
}
