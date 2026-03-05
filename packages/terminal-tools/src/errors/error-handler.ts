/**
 * Maps API errors, auth errors, and network failures to
 * user-friendly conversational messages.
 *
 * No raw JSON, stack traces, or internal error codes are
 * surfaced to the user.
 */

import { ApiClientError } from '@iexcel/api-client';
import { AuthRequiredError } from '@iexcel/terminal-auth';
import { ApiErrorCode } from '@iexcel/shared-types';

/**
 * Converts any error into a human-readable string suitable for
 * display in a Claude Code or Claw conversational session.
 *
 * Error classification:
 * - AuthRequiredError: prompt to authenticate
 * - ApiClientError: mapped by error code to specific messages
 * - ECONNREFUSED / fetch failed: server unreachable
 * - Other Error: generic fallback
 */
export function formatToolError(error: unknown): string {
  if (error instanceof AuthRequiredError) {
    return 'Authentication required. Run `iexcel login` to authenticate.';
  }

  if (error instanceof ApiClientError) {
    switch (error.code) {
      case ApiErrorCode.ClientNotFound:
      case ApiErrorCode.TaskNotFound:
      case ApiErrorCode.AgendaNotFound:
      case ApiErrorCode.TranscriptNotFound:
        return `Resource not found. ${error.message}`;

      case ApiErrorCode.Forbidden:
        return "You don't have permission to access this resource. Contact your administrator.";

      case ApiErrorCode.Unauthorized:
        return 'Your session has expired. Please authenticate: run `iexcel login`.';

      case ApiErrorCode.TaskNotApprovable:
        return `Task cannot be approved or rejected in its current status. ${error.message}`;

      case ApiErrorCode.ValidationError:
      case ApiErrorCode.InvalidId:
      case ApiErrorCode.InvalidBody:
        return `Invalid input. ${error.message}`;

      case 'NETWORK_ERROR':
        return 'Could not reach the iExcel API. Check your network connection and try again.';

      default:
        return `An unexpected error occurred. ${error.message}`;
    }
  }

  if (error instanceof Error) {
    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed')
    ) {
      return 'Cannot connect to the iExcel Mastra server. Ensure the server is running.';
    }
    return `An unexpected error occurred: ${error.message}`;
  }

  return 'An unexpected error occurred.';
}
