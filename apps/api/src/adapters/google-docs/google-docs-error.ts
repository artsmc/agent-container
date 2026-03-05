/**
 * GoogleDocsAdapterError
 *
 * Typed error class for the Google Docs output adapter.
 * Used to signal specific Google Docs API failure modes
 * (auth, not found, timeout, unavailable) to the calling endpoint.
 */

export type GoogleDocsErrorCode =
  | 'GOOGLE_AUTH_FAILED'
  | 'GOOGLE_DOC_NOT_FOUND'
  | 'GOOGLE_DOCS_TIMEOUT'
  | 'GOOGLE_DOCS_UNAVAILABLE';

export class GoogleDocsAdapterError extends Error {
  readonly code: GoogleDocsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GoogleDocsErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GoogleDocsAdapterError';
    this.code = code;
    this.details = details;
  }
}
