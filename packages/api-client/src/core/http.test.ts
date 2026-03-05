import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpTransport } from './http';
import { ApiClientError } from '../types/errors';
import type { TokenProvider } from '../types/client-options';
import { ApiErrorCode } from '@iexcel/shared-types';

/**
 * Helper to create a mock fetch that returns a new Response for each call.
 */
function mockFetch(
  status: number,
  body?: unknown,
  headers?: Record<string, string>
): typeof fetch {
  return vi.fn().mockImplementation(() => {
    const responseHeaders = new Headers({
      'content-type': 'application/json',
      ...headers,
    });
    return Promise.resolve(
      new Response(
        body !== undefined ? JSON.stringify(body) : null,
        {
          status,
          statusText: status === 200 ? 'OK' : 'Error',
          headers: responseHeaders,
        }
      )
    );
  });
}

/**
 * Helper to create a mock fetch that returns non-JSON body (new Response each call).
 */
function mockFetchRaw(
  status: number,
  body: string,
  contentType = 'text/html'
): typeof fetch {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: new Headers({ 'content-type': contentType }),
      })
    )
  );
}

/**
 * Helper to create a mock fetch that throws a network error.
 */
function mockFetchNetworkError(message: string): typeof fetch {
  return vi.fn().mockRejectedValue(new Error(message));
}

/**
 * Create a standard mock TokenProvider.
 */
function createMockTokenProvider(
  accessToken = 'valid-token-abc',
  refreshedToken = 'new-valid-token'
): TokenProvider {
  return {
    getAccessToken: vi.fn().mockResolvedValue(accessToken),
    refreshAccessToken: vi.fn().mockResolvedValue(refreshedToken),
  };
}

describe('HttpTransport', () => {
  const baseUrl = 'https://api.iexcel.test';
  let tokenProvider: TokenProvider;

  beforeEach(() => {
    tokenProvider = createMockTokenProvider();
  });

  describe('Token Attachment', () => {
    it('should attach access token to every authenticated request', async () => {
      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({ method: 'GET', path: '/clients' });

      expect(tokenProvider.getAccessToken).toHaveBeenCalledOnce();
      const calledWith = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = calledWith[1].headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer valid-token-abc');
    });

    it('should set Content-Type and Accept headers', async () => {
      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({ method: 'GET', path: '/clients' });

      const calledWith = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = calledWith[1].headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Accept')).toBe('application/json');
    });

    it('should fetch fresh token before each request', async () => {
      let callCount = 0;
      tokenProvider.getAccessToken = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(`token-${callCount}`);
      });

      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({ method: 'GET', path: '/clients' });
      await transport.request({ method: 'GET', path: '/clients' });

      expect(tokenProvider.getAccessToken).toHaveBeenCalledTimes(2);
      const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0][1].headers as Headers).get('Authorization')).toBe(
        'Bearer token-1'
      );
      expect((calls[1][1].headers as Headers).get('Authorization')).toBe(
        'Bearer token-2'
      );
    });
  });

  describe('Public Endpoint Bypass', () => {
    it('should not attach Authorization header when skipAuth is true', async () => {
      const fetchImpl = mockFetch(200, { id: 'test' });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({
        method: 'GET',
        path: '/shared/abc123',
        skipAuth: true,
      });

      expect(tokenProvider.getAccessToken).not.toHaveBeenCalled();
      const calledWith = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = calledWith[1].headers as Headers;
      expect(headers.has('Authorization')).toBe(false);
    });
  });

  describe('401 Token Refresh', () => {
    it('should retry with refreshed token on 401 response', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
            { status: 401, headers: new Headers({ 'content-type': 'application/json' }) }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'client-123' }), {
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
          })
        );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);
      const result = await transport.request<{ id: string }>({
        method: 'GET',
        path: '/clients/client-123',
      });

      expect(result).toEqual({ id: 'client-123' });
      expect(tokenProvider.refreshAccessToken).toHaveBeenCalledOnce();
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      // Verify the retry uses the new token
      const retryHeaders = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1][1]
        .headers as Headers;
      expect(retryHeaders.get('Authorization')).toBe('Bearer new-valid-token');
    });

    it('should throw UNAUTHORIZED after second consecutive 401', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
            { status: 401, headers: new Headers({ 'content-type': 'application/json' }) }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: { code: 'UNAUTHORIZED', message: 'Still expired' },
            }),
            { status: 401, headers: new Headers({ 'content-type': 'application/json' }) }
          )
        );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients/client-123' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe(ApiErrorCode.Unauthorized);
        expect(error.statusCode).toBe(401);
      }

      // refresh called exactly once (not twice)
      expect(tokenProvider.refreshAccessToken).toHaveBeenCalledOnce();
      // fetch called twice: initial + one retry
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('should not trigger refresh on 403', async () => {
      const fetchImpl = mockFetchRaw(
        403,
        JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        }),
        'application/json'
      );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients/client-123' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe(ApiErrorCode.Forbidden);
        expect(error.statusCode).toBe(403);
      }

      expect(tokenProvider.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should throw NETWORK_ERROR when refreshAccessToken throws', async () => {
      const tp: TokenProvider = {
        getAccessToken: vi.fn().mockResolvedValue('expired-token'),
        refreshAccessToken: vi.fn().mockRejectedValue(new Error('refresh failed')),
      };

      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
          { status: 401, headers: new Headers({ 'content-type': 'application/json' }) }
        )
      );

      const transport = new HttpTransport(baseUrl, tp, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.message).toBe('Token refresh failed');
      }
    });

    it('should wrap network error during retry as NETWORK_ERROR', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
            { status: 401, headers: new Headers({ 'content-type': 'application/json' }) }
          )
        )
        .mockRejectedValueOnce(new Error('connection reset'));

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients/client-123' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.statusCode).toBe(0);
        expect(error.message).toContain('connection reset');
      }
    });

    it('should not trigger refresh on skipAuth 401', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Not found' },
          }),
          { status: 401, headers: new Headers({ 'content-type': 'application/json' }) }
        )
      );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await expect(
        transport.request({
          method: 'GET',
          path: '/shared/token',
          skipAuth: true,
        })
      ).rejects.toThrow(ApiClientError);

      expect(tokenProvider.refreshAccessToken).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledOnce();
    });
  });

  describe('Error Parsing', () => {
    it('should parse API JSON error response into ApiClientError', async () => {
      const errorBody = {
        error: {
          code: 'TASK_NOT_APPROVABLE',
          message: 'Task is in draft status and must be reviewed before approval.',
          details: { task_id: 'abc-123', current_status: 'draft' },
        },
      };
      const fetchImpl = mockFetchRaw(
        422,
        JSON.stringify(errorBody),
        'application/json'
      );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({
          method: 'POST',
          path: '/tasks/abc-123/approve',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('TASK_NOT_APPROVABLE');
        expect(error.message).toBe(
          'Task is in draft status and must be reviewed before approval.'
        );
        expect(error.statusCode).toBe(422);
        expect(error.details).toEqual({
          task_id: 'abc-123',
          current_status: 'draft',
        });
      }
    });

    it('should wrap non-JSON error response as UNKNOWN_ERROR', async () => {
      const fetchImpl = mockFetchRaw(502, '<html>Bad Gateway</html>');

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'POST', path: '/tasks/task-123/push' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('UNKNOWN_ERROR');
        expect(error.statusCode).toBe(502);
        expect(error.details).toEqual({ rawBody: '<html>Bad Gateway</html>' });
      }
    });

    it('should wrap network error as NETWORK_ERROR', async () => {
      const fetchImpl = mockFetchNetworkError('connect ECONNREFUSED 127.0.0.1:3000');

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.statusCode).toBe(0);
        expect(error.message).toContain('ECONNREFUSED');
      }
    });

    it('should handle unreadable error response body', async () => {
      // Create a response whose .text() throws
      const brokenResponse = {
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockRejectedValue(new Error('body stream error')),
        json: vi.fn().mockRejectedValue(new Error('body stream error')),
      } as unknown as Response;

      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(brokenResponse);
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('UNKNOWN_ERROR');
        expect(error.statusCode).toBe(500);
        expect(error.message).toBe('Failed to read error response');
      }
    });

    it('should handle non-Error thrown by network', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue('string error');
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.message).toBe('Network request failed');
      }
    });

    it('should handle non-Error thrown during retry', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
            { status: 401, headers: new Headers({ 'content-type': 'application/json' }) }
          )
        )
        .mockRejectedValueOnce('string error in retry');

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.message).toBe('Network request failed');
      }
    });

    it('should handle JSON error body without error.code', async () => {
      const fetchImpl = mockFetchRaw(
        500,
        JSON.stringify({ message: 'Something went wrong' }),
        'application/json'
      );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      try {
        await transport.request({ method: 'GET', path: '/clients' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const error = err as ApiClientError;
        expect(error.code).toBe('UNKNOWN_ERROR');
        expect(error.statusCode).toBe(500);
      }
    });
  });

  describe('URL Construction', () => {
    it('should normalise trailing slash in baseUrl', async () => {
      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(
        'https://api.iexcel.test/',
        tokenProvider,
        fetchImpl
      );

      await transport.request({ method: 'GET', path: '/clients' });

      const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl).toBe('https://api.iexcel.test/clients');
      expect(calledUrl).not.toContain('//clients');
    });

    it('should serialise query parameters', async () => {
      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({
        method: 'GET',
        path: '/clients/c1/tasks',
        params: { status: 'draft', page: 1, limit: 20 },
      });

      const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('status')).toBe('draft');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('20');
    });

    it('should omit undefined and null params from query string', async () => {
      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({
        method: 'GET',
        path: '/audit',
        params: { entity_type: 'task', user_id: undefined, date_from: null },
      });

      const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('entity_type')).toBe('task');
      expect(url.searchParams.has('user_id')).toBe(false);
      expect(url.searchParams.has('date_from')).toBe(false);
    });

    it('should serialise boolean params as string', async () => {
      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({
        method: 'GET',
        path: '/test',
        params: { active: true },
      });

      const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('active')).toBe('true');
    });
  });

  describe('Response Handling', () => {
    it('should return undefined for 204 No Content', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: new Headers(),
        })
      );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);
      const result = await transport.request<void>({
        method: 'DELETE',
        path: '/asana/workspaces/w1',
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined for content-length 0', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 200,
          headers: new Headers({ 'content-length': '0' }),
        })
      );

      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);
      const result = await transport.request<void>({
        method: 'POST',
        path: '/test',
      });

      expect(result).toBeUndefined();
    });

    it('should send JSON body for POST requests', async () => {
      const fetchImpl = mockFetch(200, { id: 'new-task' });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);
      const body = { title: 'Test Task', description: { taskContext: 'ctx', additionalContext: 'add', requirements: [] } };

      await transport.request({
        method: 'POST',
        path: '/clients/c1/tasks',
        body,
      });

      const calledWith = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(calledWith.body).toBe(JSON.stringify(body));
    });

    it('should not include body for GET requests', async () => {
      const fetchImpl = mockFetch(200, { data: [] });
      const transport = new HttpTransport(baseUrl, tokenProvider, fetchImpl);

      await transport.request({ method: 'GET', path: '/clients' });

      const calledWith = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(calledWith.body).toBeUndefined();
    });
  });

  describe('buildUrl', () => {
    it('should build URL with path only', () => {
      const transport = new HttpTransport(baseUrl, tokenProvider, vi.fn());
      expect(transport.buildUrl('/clients')).toBe('https://api.iexcel.test/clients');
    });

    it('should handle multiple trailing slashes', () => {
      const transport = new HttpTransport(
        'https://api.iexcel.test///',
        tokenProvider,
        vi.fn()
      );
      expect(transport.buildUrl('/clients')).toBe('https://api.iexcel.test/clients');
    });
  });
});
