/**
 * Asana HTTP Client
 *
 * Thin wrapper around the Asana REST API for task creation and project
 * task listing. Implements retry logic with exponential back-off for
 * transient failures (429 rate-limited, 5xx server errors) using p-retry.
 *
 * Non-retryable client errors (400, 401, 403, 404, other 4xx) abort
 * retries immediately and throw AdapterError with code PUSH_FAILED.
 *
 * All HTTP calls have a configurable timeout enforced via AbortController.
 */

import pRetry, { AbortError } from 'p-retry';
import { ApiErrorCode } from '@iexcel/shared-types';
import { AdapterError } from './errors';
import {
  ReconciliationError,
  ProjectNotFoundError,
} from './reconciliation-error';
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

// ---------------------------------------------------------------------------
// Reconciliation types (internal to the adapter layer)
// ---------------------------------------------------------------------------

export interface AsanaTaskItem {
  gid: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  assignee: {
    gid: string;
    name: string;
  } | null;
  custom_fields: Array<{
    gid: string;
    name: string;
    display_value: string | null;
  }>;
}

interface AsanaTaskListResponse {
  data: AsanaTaskItem[];
  next_page: {
    offset: string;
    path: string;
    uri: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Reconciliation constants
// ---------------------------------------------------------------------------

const TASK_FETCH_TIMEOUT_MS = 15_000;
const RECONCILE_MAX_RETRIES = 2; // 3 total attempts
const PAGE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Reconciliation helpers
// ---------------------------------------------------------------------------

function buildTaskListUrl(projectGid: string, offset?: string): string {
  const params = new URLSearchParams({
    project: projectGid,
    opt_fields: 'gid,name,completed,completed_at,assignee.name,custom_fields',
    limit: String(PAGE_LIMIT),
  });
  if (offset) {
    params.set('offset', offset);
  }
  return `${ASANA_BASE_URL}/tasks?${params.toString()}`;
}

async function fetchPageWithRetry(
  url: string,
  accessToken: string,
): Promise<AsanaTaskListResponse> {
  return pRetry(
    async () => {
      let response: Response;
      try {
        response = await fetchWithTimeout(
          url,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          },
          TASK_FETCH_TIMEOUT_MS,
        );
      } catch (error) {
        // fetchWithTimeout throws AdapterError on timeout — rethrow as
        // ReconciliationError so the reconciliation layer handles it
        if (error instanceof AdapterError) {
          throw new ReconciliationError(
            'ASANA_TIMEOUT',
            'Asana API request timed out',
            { url },
          );
        }
        throw error;
      }

      // Non-retryable auth errors
      if (response.status === 401 || response.status === 403) {
        throw new AbortError(
          new ReconciliationError('ASANA_AUTH_FAILED', `Asana returned ${response.status}`, {
            status: response.status,
          }),
        );
      }

      // 404: project not found — signal to caller, not retryable
      if (response.status === 404) {
        throw new AbortError(
          new ProjectNotFoundError(url),
        );
      }

      // Success
      if (response.status === 200) {
        return response.json() as Promise<AsanaTaskListResponse>;
      }

      // 429: respect Retry-After header
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
        if (delayMs > 0 && !isNaN(delayMs)) {
          await sleep(delayMs);
        }
      }

      // Retryable: 429, 5xx
      throw new ReconciliationError(
        'ASANA_UNAVAILABLE',
        `Asana returned ${response.status}`,
        { status: response.status },
      );
    },
    {
      retries: RECONCILE_MAX_RETRIES,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 4000,
      randomize: true,
    },
  ).catch((error: unknown) => {
    // AbortError wraps our typed errors — unwrap them
    if (error instanceof AbortError) {
      const cause = error.cause;
      if (cause instanceof ReconciliationError) throw cause;
      if (cause instanceof ProjectNotFoundError) throw cause;
    }
    // Already a ReconciliationError — rethrow as-is
    if (error instanceof ReconciliationError) throw error;
    if (error instanceof ProjectNotFoundError) throw error;
    // Retries exhausted — wrap in ReconciliationError
    throw new ReconciliationError(
      'ASANA_UNAVAILABLE',
      'Asana API task fetch failed after maximum retries',
    );
  });
}

// ---------------------------------------------------------------------------
// Reconciliation public API
// ---------------------------------------------------------------------------

/**
 * Fetches all tasks for a given Asana project, handling pagination.
 *
 * - Follows `next_page` offsets until all pages are retrieved.
 * - Retries transient failures (429, 5xx) with exponential back-off.
 * - Throws ReconciliationError on auth failures or exhausted retries.
 * - Throws ProjectNotFoundError on 404 (project deleted/moved).
 *
 * @param projectGid - The Asana project GID to fetch tasks from
 * @param accessToken - Bearer token for the Asana API
 * @returns Flat array of all tasks in the project
 */
export async function fetchProjectTasks(
  projectGid: string,
  accessToken: string,
): Promise<AsanaTaskItem[]> {
  const allTasks: AsanaTaskItem[] = [];
  let offset: string | undefined = undefined;

  do {
    const url = buildTaskListUrl(projectGid, offset);
    const page = await fetchPageWithRetry(url, accessToken);
    allTasks.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset !== undefined);

  return allTasks;
}
