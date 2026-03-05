/**
 * Typed error class for Asana status reconciliation.
 *
 * Used to signal non-recoverable errors during the reconciliation
 * of local task status with live Asana API data.
 *
 * Error codes:
 * - ASANA_AUTH_FAILED: 401/403 from Asana API — credentials invalid or revoked
 * - ASANA_UNAVAILABLE: 5xx or retries exhausted on transient failures
 * - ASANA_TIMEOUT: Individual request exceeded the 15-second timeout budget
 */

export type ReconciliationErrorCode =
  | 'ASANA_AUTH_FAILED'
  | 'ASANA_UNAVAILABLE'
  | 'ASANA_TIMEOUT';

export class ReconciliationError extends Error {
  readonly code: ReconciliationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ReconciliationErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ReconciliationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Thrown when a specific Asana project GID returns 404.
 * This is NOT a fatal error — reconciliation continues for other projects.
 */
export class ProjectNotFoundError extends Error {
  readonly projectGid: string;

  constructor(projectGid: string) {
    super(`Asana project not found: ${projectGid}`);
    this.name = 'ProjectNotFoundError';
    this.projectGid = projectGid;
  }
}
