/**
 * HTTP client for Grain API interactions.
 *
 * Handles authentication, retry with exponential back-off, request timeout,
 * pagination, and error mapping to GrainNormalizerError instances.
 *
 * The client is injectable — tests can provide a mock fetch function
 * without making real network calls.
 */

import { ApiErrorCode } from '@iexcel/shared-types';
import { GrainNormalizerError } from './errors.js';

// ---------------------------------------------------------------------------
// Grain API response types
// ---------------------------------------------------------------------------

export interface GrainSegment {
  speaker: string;
  start_time: number;
  end_time?: number;
  text: string;
}

export interface GrainTranscript {
  segments: GrainSegment[];
}

export interface GrainRecording {
  id: string;
  title?: string;
  created_at: string;
  started_at?: string;
  duration?: number;
  participants?: Array<{ name: string }>;
  transcript?: GrainTranscript | null;
}

export interface GrainRecordingResponse {
  recording: GrainRecording;
  next_page_token?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GrainClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.grain.com/v1';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3; // 1 initial + 2 retries
const BASE_RETRY_WAIT_MS = 2_000;
const MAX_PAGINATION_PAGES = 50;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GrainApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: GrainClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  /**
   * Fetch a recording with its transcript from Grain.
   * Handles pagination to collect all transcript segments.
   */
  async fetchRecording(grainRecordingId: string): Promise<GrainRecording> {
    const url = `${this.baseUrl}/recordings/${encodeURIComponent(grainRecordingId)}?include=transcript`;
    const firstResponse = await this.fetchWithRetry(url);
    const recording = firstResponse.recording;

    // Handle pagination of transcript segments
    if (firstResponse.next_page_token && recording.transcript) {
      let pageToken: string | undefined = firstResponse.next_page_token;
      let pageCount = 1;

      while (pageToken && pageCount < MAX_PAGINATION_PAGES) {
        const pageUrl = `${url}&page_token=${encodeURIComponent(pageToken)}`;
        const pageResponse = await this.fetchWithRetry(pageUrl);
        pageCount++;

        if (pageResponse.recording.transcript?.segments) {
          recording.transcript.segments.push(
            ...pageResponse.recording.transcript.segments
          );
        }

        pageToken = pageResponse.next_page_token;

        if (pageToken && pageCount >= MAX_PAGINATION_PAGES) {
          // Log warning: pagination truncated (structured log, no PII)
          console.warn(
            JSON.stringify({
              event: 'grain.pagination_truncated',
              grainRecordingId,
              pagesCollected: pageCount,
              maxPages: MAX_PAGINATION_PAGES,
            })
          );
        }
      }
    }

    return recording;
  }

  /**
   * Execute a single HTTP request with retry logic.
   */
  private async fetchWithRetry(url: string): Promise<GrainRecordingResponse> {
    let lastError: GrainNormalizerError | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.executeFetch(url);

        if (response.ok) {
          const data = (await response.json()) as GrainRecordingResponse;
          return data;
        }

        // Map non-retryable errors immediately
        if (!RETRYABLE_STATUS_CODES.has(response.status)) {
          throw this.mapHttpError(response.status, await this.safeReadBody(response));
        }

        // Retryable error — compute wait time
        lastError = this.mapHttpError(response.status, await this.safeReadBody(response));

        if (attempt < this.maxRetries - 1) {
          const waitMs = this.computeRetryWait(attempt, response);
          // Log retry attempt (no PII)
          console.warn(
            JSON.stringify({
              event: 'grain.retry',
              attempt: attempt + 1,
              waitMs,
              grainStatus: response.status,
            })
          );
          await this.sleep(waitMs);
        }
      } catch (error: unknown) {
        if (error instanceof GrainNormalizerError) {
          // Non-retryable mapped errors bubble up immediately
          if (!RETRYABLE_STATUS_CODES.has(error.httpStatus)) {
            throw error;
          }
          lastError = error;
          if (attempt >= this.maxRetries - 1) break;
          const waitMs = this.computeRetryWait(attempt);
          await this.sleep(waitMs);
        } else if (
          error instanceof DOMException ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          throw new GrainNormalizerError(
            ApiErrorCode.GrainApiError,
            'Grain API request timed out',
            502
          );
        } else {
          throw new GrainNormalizerError(
            ApiErrorCode.GrainApiError,
            'Grain API request failed unexpectedly',
            502,
            { originalError: String(error) }
          );
        }
      }
    }

    throw (
      lastError ??
      new GrainNormalizerError(
        ApiErrorCode.GrainApiError,
        'Grain API rate limit exceeded after retries',
        502
      )
    );
  }

  /**
   * Execute a single fetch with timeout.
   */
  private async executeFetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Map an HTTP status code to the appropriate GrainNormalizerError.
   */
  private mapHttpError(
    status: number,
    body?: string
  ): GrainNormalizerError {
    let details: Record<string, unknown> | undefined;
    if (body) {
      try {
        details = JSON.parse(body) as Record<string, unknown>;
      } catch {
        details = { rawBody: body };
      }
    }

    switch (status) {
      case 404:
        return new GrainNormalizerError(
          ApiErrorCode.GrainRecordingNotFound,
          'Grain recording not found',
          404,
          details
        );
      case 401:
      case 403:
        return new GrainNormalizerError(
          ApiErrorCode.GrainAccessDenied,
          'Access denied to Grain API',
          403,
          details
        );
      case 429:
        return new GrainNormalizerError(
          ApiErrorCode.GrainApiError,
          'Grain API rate limit exceeded after retries',
          502,
          details
        );
      case 500:
      case 503:
        return new GrainNormalizerError(
          ApiErrorCode.GrainApiError,
          'Grain API server error',
          502,
          details
        );
      default:
        return new GrainNormalizerError(
          ApiErrorCode.GrainApiError,
          `Grain API returned unexpected status ${status}`,
          502,
          details
        );
    }
  }

  /**
   * Compute retry wait with exponential back-off and jitter.
   * Honors Retry-After header on 429 responses.
   */
  private computeRetryWait(attempt: number, response?: Response): number {
    let baseWait = BASE_RETRY_WAIT_MS * Math.pow(2, attempt);

    // Honor Retry-After header
    if (response) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        const retryAfterMs = parseFloat(retryAfter) * 1000;
        if (!isNaN(retryAfterMs) && retryAfterMs > 0) {
          baseWait = Math.max(baseWait, retryAfterMs);
        }
      }
    }

    // Apply +-20% jitter
    const jitter = baseWait * 0.2 * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(baseWait + jitter));
  }

  /**
   * Safely read response body as text.
   */
  private async safeReadBody(response: Response): Promise<string | undefined> {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
