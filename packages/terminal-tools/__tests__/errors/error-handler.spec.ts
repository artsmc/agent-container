import { describe, it, expect } from 'vitest';
import { formatToolError } from '../../src/errors/error-handler.js';
import { ApiClientError } from '@iexcel/api-client';
import { AuthRequiredError } from '@iexcel/terminal-auth';
import { ApiErrorCode } from '@iexcel/shared-types';

describe('formatToolError', () => {
  it('handles AuthRequiredError', () => {
    const error = new AuthRequiredError();
    const result = formatToolError(error);
    expect(result).toBe(
      'Authentication required. Run `iexcel login` to authenticate.'
    );
  });

  it('handles ApiClientError with CLIENT_NOT_FOUND', () => {
    const error = new ApiClientError(
      'No client with that name',
      ApiErrorCode.ClientNotFound,
      404
    );
    const result = formatToolError(error);
    expect(result).toContain('Resource not found');
    expect(result).toContain('No client with that name');
  });

  it('handles ApiClientError with TASK_NOT_FOUND', () => {
    const error = new ApiClientError(
      'Task TSK-9999 not found',
      ApiErrorCode.TaskNotFound,
      404
    );
    const result = formatToolError(error);
    expect(result).toContain('Resource not found');
  });

  it('handles ApiClientError with AGENDA_NOT_FOUND', () => {
    const error = new ApiClientError(
      'No agenda exists',
      ApiErrorCode.AgendaNotFound,
      404
    );
    const result = formatToolError(error);
    expect(result).toContain('Resource not found');
  });

  it('handles ApiClientError with TRANSCRIPT_NOT_FOUND', () => {
    const error = new ApiClientError(
      'No transcript found',
      ApiErrorCode.TranscriptNotFound,
      404
    );
    const result = formatToolError(error);
    expect(result).toContain('Resource not found');
  });

  it('handles ApiClientError with FORBIDDEN', () => {
    const error = new ApiClientError(
      'Forbidden',
      ApiErrorCode.Forbidden,
      403
    );
    const result = formatToolError(error);
    expect(result).toContain("don't have permission");
    expect(result).toContain('Contact your administrator');
  });

  it('handles ApiClientError with UNAUTHORIZED', () => {
    const error = new ApiClientError(
      'Unauthorized',
      ApiErrorCode.Unauthorized,
      401
    );
    const result = formatToolError(error);
    expect(result).toContain('session has expired');
    expect(result).toContain('iexcel login');
  });

  it('handles ApiClientError with TASK_NOT_APPROVABLE', () => {
    const error = new ApiClientError(
      'Task is in approved status',
      ApiErrorCode.TaskNotApprovable,
      422
    );
    const result = formatToolError(error);
    expect(result).toContain('cannot be approved or rejected');
  });

  it('handles ApiClientError with VALIDATION_ERROR', () => {
    const error = new ApiClientError(
      'Invalid task ID format',
      ApiErrorCode.ValidationError,
      400
    );
    const result = formatToolError(error);
    expect(result).toContain('Invalid input');
  });

  it('handles ApiClientError with NETWORK_ERROR', () => {
    const error = new ApiClientError(
      'Network error',
      'NETWORK_ERROR',
      0
    );
    const result = formatToolError(error);
    expect(result).toContain('Could not reach the iExcel API');
  });

  it('handles ApiClientError with unknown code', () => {
    const error = new ApiClientError(
      'Something broke',
      'UNKNOWN_ERROR',
      500
    );
    const result = formatToolError(error);
    expect(result).toContain('unexpected error occurred');
    expect(result).toContain('Something broke');
  });

  it('handles ECONNREFUSED error', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:8081');
    const result = formatToolError(error);
    expect(result).toContain('Cannot connect to the iExcel Mastra server');
  });

  it('handles fetch failed error', () => {
    const error = new Error('fetch failed');
    const result = formatToolError(error);
    expect(result).toContain('Cannot connect to the iExcel Mastra server');
  });

  it('handles generic Error', () => {
    const error = new Error('Something unexpected');
    const result = formatToolError(error);
    expect(result).toContain('unexpected error occurred');
    expect(result).toContain('Something unexpected');
  });

  it('handles non-Error values', () => {
    const result = formatToolError('string error');
    expect(result).toBe('An unexpected error occurred.');
  });

  it('handles null', () => {
    const result = formatToolError(null);
    expect(result).toBe('An unexpected error occurred.');
  });

  it('handles undefined', () => {
    const result = formatToolError(undefined);
    expect(result).toBe('An unexpected error occurred.');
  });
});
