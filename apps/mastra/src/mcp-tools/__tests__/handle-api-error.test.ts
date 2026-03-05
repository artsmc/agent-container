/**
 * Unit tests for handle-api-error helper.
 * @see Feature 21 — Task 1.8
 */
import { describe, it, expect } from 'vitest';
import { handleApiError } from '../helpers/handle-api-error.js';
import { ApiClientError } from '@iexcel/api-client';
import { ClientNotFoundError, AmbiguousClientError } from '../helpers/resolve-client.js';

describe('handleApiError', () => {
  it('maps 401 to session expired message', () => {
    const error = new ApiClientError('Unauthorized', 'UNAUTHORIZED' as any, 401);
    expect(handleApiError(error)).toBe(
      'Your session has expired. Re-authenticate and try again.',
    );
  });

  it('maps 403 to permission denied message', () => {
    const error = new ApiClientError('Forbidden', 'FORBIDDEN' as any, 403);
    expect(handleApiError(error, { resource: 'that client' })).toBe(
      "You don't have permission to access that client. Contact your administrator.",
    );
  });

  it('maps 404 to resource not found', () => {
    const error = new ApiClientError('Not Found', 'TASK_NOT_FOUND' as any, 404);
    expect(handleApiError(error)).toBe('Resource not found.');
  });

  it('maps 409 to conflict with detail', () => {
    const error = new ApiClientError('Conflict', 'TASK_NOT_APPROVABLE' as any, 409, {
      message: 'Task is already approved',
    });
    expect(handleApiError(error)).toBe('Task is already approved');
  });

  it('maps 5xx to server error message', () => {
    const error = new ApiClientError('Internal Server Error', 'INTERNAL_ERROR' as any, 500);
    expect(handleApiError(error)).toBe(
      'An unexpected server error occurred. Try again shortly.',
    );
  });

  it('maps NETWORK_ERROR to connectivity message', () => {
    const error = new ApiClientError('Network error', 'NETWORK_ERROR', 0);
    expect(handleApiError(error)).toBe(
      'Could not reach the iExcel API. Check your network connection and try again.',
    );
  });

  it('handles ClientNotFoundError', () => {
    const error = new ClientNotFoundError('Unknown Corp');
    expect(handleApiError(error)).toContain("No client named 'Unknown Corp' found");
  });

  it('handles AmbiguousClientError', () => {
    const error = new AmbiguousClientError('Total');
    expect(handleApiError(error)).toContain("Multiple clients match 'Total'");
  });

  it('handles unknown error types gracefully', () => {
    const error = new Error('something unexpected');
    expect(handleApiError(error)).toBe(
      'An unexpected error occurred. Try again shortly.',
    );
  });

  it('handles non-Error throws', () => {
    expect(handleApiError('string error')).toBe(
      'An unexpected error occurred. Try again shortly.',
    );
  });

  it('handles TypeError fetch errors', () => {
    const error = new TypeError('fetch failed');
    expect(handleApiError(error)).toBe(
      'Could not reach the iExcel API. Check your network connection and try again.',
    );
  });
});
