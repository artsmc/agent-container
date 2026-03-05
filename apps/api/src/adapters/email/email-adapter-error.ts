/**
 * Typed error class for the email adapter.
 *
 * Used to distinguish email-specific failures (auth, timeout, provider
 * unavailable, empty recipients) from generic runtime errors. The retry
 * wrapper inspects `instanceof EmailAdapterError` to decide whether an
 * error is retryable.
 */

export type EmailAdapterErrorCode =
  | 'NO_RECIPIENTS'
  | 'EMAIL_AUTH_FAILED'
  | 'EMAIL_TIMEOUT'
  | 'EMAIL_PROVIDER_UNAVAILABLE';

export class EmailAdapterError extends Error {
  readonly code: EmailAdapterErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EmailAdapterErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'EmailAdapterError';
    this.code = code;
    this.details = details;
  }
}
