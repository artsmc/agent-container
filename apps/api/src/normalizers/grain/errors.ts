import { ApiErrorCode } from '@iexcel/shared-types';
import { NormalizerError } from '../text/errors.js';

/**
 * Grain-specific normalizer error.
 * Extends the base NormalizerError from Feature 08 with HTTP status and
 * optional details payload for richer error context.
 */
export class GrainNormalizerError extends NormalizerError {
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>
  ) {
    super(code, message);
    this.name = 'GrainNormalizerError';
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
