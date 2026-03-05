import type { ApiErrorResponse } from '@iexcel/shared-types';
import type { TokenProvider } from '../types/client-options';
import { ApiClientError } from '../types/errors';

/**
 * HTTP methods supported by the transport layer.
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Parameter value types accepted by query string serialisation.
 * Arrays are serialised as repeated parameters.
 */
export type ParamValue =
  | string
  | number
  | boolean
  | undefined
  | null;

/**
 * Options for a single HTTP request through the transport layer.
 */
export interface RequestOptions {
  method: HttpMethod;
  path: string;
  params?: Record<string, ParamValue>;
  body?: unknown;
  /** When true, no Authorization header is attached and no token refresh is attempted. */
  skipAuth?: boolean;
}

/**
 * Internal HTTP transport used by the ApiClient class.
 * Handles URL construction, header management, token attachment,
 * 401 refresh logic, and error parsing.
 *
 * This class is not exported from the package's public API.
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(
    baseUrl: string,
    tokenProvider: TokenProvider,
    fetchImpl: typeof fetch
  ) {
    // Normalise trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
  }

  /**
   * Execute an HTTP request with automatic token attachment and 401 retry.
   */
  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.params);
    const headers = await this.buildHeaders(options.skipAuth);
    const init: RequestInit = {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    };

    let response: Response;

    try {
      response = await this.fetchImpl(url, init);
    } catch (err: unknown) {
      throw new ApiClientError(
        err instanceof Error ? err.message : 'Network request failed',
        'NETWORK_ERROR',
        0,
        { cause: err instanceof Error ? err.message : String(err) }
      );
    }

    // Token refresh on 401 -- single retry
    if (response.status === 401 && !options.skipAuth) {
      let newToken: string;
      try {
        newToken = await this.tokenProvider.refreshAccessToken();
      } catch (err: unknown) {
        throw new ApiClientError(
          'Token refresh failed',
          'NETWORK_ERROR',
          0,
          { cause: err instanceof Error ? err.message : String(err) }
        );
      }

      (headers as Headers).set('Authorization', `Bearer ${newToken}`);
      const retryInit: RequestInit = {
        method: options.method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      };

      try {
        response = await this.fetchImpl(url, retryInit);
      } catch (err: unknown) {
        throw new ApiClientError(
          err instanceof Error ? err.message : 'Network request failed',
          'NETWORK_ERROR',
          0,
          { cause: err instanceof Error ? err.message : String(err) }
        );
      }
    }

    // Handle non-2xx after potential retry
    if (!response.ok) {
      return this.throwParsedError(response);
    }

    // 204 No Content or empty body
    if (
      response.status === 204 ||
      response.headers.get('content-length') === '0'
    ) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Build a full URL from the base, path, and optional query parameters.
   * Undefined and null parameter values are omitted from the query string.
   */
  buildUrl(path: string, params?: Record<string, ParamValue>): string {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Build request headers with Content-Type, Accept, and optional Authorization.
   */
  private async buildHeaders(skipAuth?: boolean): Promise<Headers> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    });

    if (!skipAuth) {
      const token = await this.tokenProvider.getAccessToken();
      headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  /**
   * Parse the error response body and throw a typed ApiClientError.
   * Attempts JSON parsing first; falls back to raw text for non-JSON responses.
   */
  private async throwParsedError(response: Response): Promise<never> {
    let rawText: string;
    try {
      rawText = await response.text();
    } catch {
      throw new ApiClientError(
        'Failed to read error response',
        'UNKNOWN_ERROR',
        response.status
      );
    }

    // Attempt to parse as JSON API error response
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new ApiClientError(
        'Unexpected non-JSON error response',
        'UNKNOWN_ERROR',
        response.status,
        { rawBody: rawText }
      );
    }

    const errorBody = parsed as ApiErrorResponse;
    if (errorBody?.error?.code) {
      throw new ApiClientError(
        errorBody.error.message,
        errorBody.error.code,
        response.status,
        errorBody.error.details
      );
    }

    throw new ApiClientError(
      'Unknown API error',
      'UNKNOWN_ERROR',
      response.status,
      { rawBody: parsed as Record<string, unknown> }
    );
  }
}
