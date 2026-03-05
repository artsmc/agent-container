/**
 * Maps API errors to user-friendly messages for MCP tool responses.
 *
 * Never includes raw JSON, stack traces, UUIDs, or token values.
 *
 * @see Feature 21 — FR-90, FR-91
 */
import { ApiClientError } from '@iexcel/api-client';
import { ClientNotFoundError, AmbiguousClientError } from './resolve-client.js';

/**
 * Convert an error into a safe, user-readable string.
 *
 * @param error - The caught error (may be ApiClientError, ClientNotFoundError, etc.)
 * @param toolContext - Optional context for enriching error messages
 * @returns A user-friendly error message string
 */
export function handleApiError(
  error: unknown,
  toolContext?: { toolId?: string; resource?: string },
): string {
  // Custom domain errors
  if (error instanceof ClientNotFoundError) {
    return error.message;
  }

  if (error instanceof AmbiguousClientError) {
    return error.message;
  }

  // API client errors
  if (error instanceof ApiClientError) {
    const resource = toolContext?.resource ?? 'that resource';

    switch (error.statusCode) {
      case 401:
        return 'Your session has expired. Re-authenticate and try again.';
      case 403:
        return `You don't have permission to access ${resource}. Contact your administrator.`;
      case 404:
        return `Resource not found.`;
      case 409: {
        // Extract detail from the API error if available
        const detail = error.details?.['message'] as string | undefined;
        return detail ?? 'The operation could not be completed due to a conflict. Check the current state and try again.';
      }
      default:
        break;
    }

    // Check error code for network-level issues
    if (error.code === 'NETWORK_ERROR') {
      return 'Could not reach the iExcel API. Check your network connection and try again.';
    }

    // 5xx errors
    if (error.statusCode >= 500) {
      return 'An unexpected server error occurred. Try again shortly.';
    }

    return 'An unexpected error occurred. Try again shortly.';
  }

  // Network errors (fetch failures)
  if (error instanceof TypeError && (error as TypeError).message?.includes('fetch')) {
    return 'Could not reach the iExcel API. Check your network connection and try again.';
  }

  return 'An unexpected error occurred. Try again shortly.';
}
