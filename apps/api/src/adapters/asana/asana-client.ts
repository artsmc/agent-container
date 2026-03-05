/**
 * Asana HTTP Client
 *
 * Thin wrapper around the Asana REST API for task creation.
 * Implements retry logic with exponential back-off for transient failures
 * (429 rate-limited, 5xx server errors) using p-retry.
 *
 * Non-retryable client errors (400, 401, 403, 404, other 4xx) abort
 * retries immediately and throw AdapterError with code PUSH_FAILED.
 *
 * All HTTP calls have a 10-second timeout enforced via AbortController.
 */

import pRetry, { AbortError } from 'p-retry';
import { ApiErrorCode } from '@iexcel/shared-types';
import { AdapterError } from './errors';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsanaCreateTaskPayload {
  workspace: string;
  projects: string[];
  name: string;
  notes: string;
  assignee?: string;
  custom_fields: Record<string, string>;
}

export interface AsanaCreateTaskResponse {
  data: {
    gid: string;
    permalink_url: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2; // 3 total attempts (initial + 2 retries)

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AdapterError(
        ApiErrorCode.PushFailed,
        'Asana API request timed out',
        502,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Error builders
// ---------------------------------------------------------------------------

function buildPushFailedError(
  status: number,
  body: Record<string, unknown>,
): AdapterError {
  let message: string;

  switch (status) {
    case 400:
      message = 'Asana API returned a bad request error';
      break;
    case 401:
      message = 'Asana access token is invalid or expired';
      break;
    case 403:
      message = 'Asana access denied to workspace or project';
      break;
    case 404:
      message = 'Asana workspace or project GID not found';
      break;
    default:
      message = `Asana API returned HTTP ${status}`;
  }

  return new AdapterError(ApiErrorCode.PushFailed, message, 502, {
    asanaStatus: status,
    asanaBody: body,
  });
}

// ---------------------------------------------------------------------------
// Sleep utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a task in Asana with automatic retry for transient failures.
 *
 * - 201 Created: Returns the parsed response body.
 * - 4xx (except 429): Throws immediately (non-retryable).
 * - 429 / 5xx: Retries with exponential back-off (up to MAX_RETRIES times).
 * - Timeout: Throws PUSH_FAILED with timeout message.
 */
export async function createTaskWithRetry(
  payload: AsanaCreateTaskPayload,
  accessToken: string,
): Promise<AsanaCreateTaskResponse> {
  return pRetry(
    async () => {
      const response = await fetchWithTimeout(
        `${ASANA_BASE_URL}/tasks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ data: payload }),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (response.status === 201) {
        return response.json() as Promise<AsanaCreateTaskResponse>;
      }

      // Non-retryable client errors (4xx except 429)
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        const body = await response.json().catch(() => ({}));
        throw new AbortError(
          buildPushFailedError(
            response.status,
            body as Record<string, unknown>,
          ),
        );
      }

      // Retryable: 429 and 5xx
      // Honour Retry-After header if present
      const retryAfterHeader = response.headers.get('Retry-After');
      if (retryAfterHeader) {
        const retryAfterMs = parseInt(retryAfterHeader, 10) * 1000;
        if (retryAfterMs > 0 && !isNaN(retryAfterMs)) {
          await sleep(retryAfterMs);
        }
      }

      // Throw a generic error to trigger p-retry
      throw buildPushFailedError(response.status, {});
    },
    {
      retries: MAX_RETRIES,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 4000,
      randomize: true,
      onFailedAttempt: (error) => {
        logger.warn(
          {
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            message: error.message,
          },
          'Asana API retry triggered',
        );
      },
    },
  ).catch((error: unknown) => {
    // If the error is already an AdapterError, re-throw it
    if (error instanceof AdapterError) {
      throw error;
    }
    // p-retry wraps AbortError; unwrap if the original cause is AdapterError
    if (
      error instanceof AbortError &&
      error.cause instanceof AdapterError
    ) {
      throw error.cause;
    }
    // Retries exhausted -- wrap in AdapterError
    throw new AdapterError(
      ApiErrorCode.PushFailed,
      'Asana API push failed after maximum retries',
      502,
    );
  });
}
