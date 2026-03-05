import { describe, it, expect, vi } from 'vitest';
import { createApiClient } from '../core/api-client';
import type { ApiClientOptions } from '../types/client-options';

function createTestClient(fetchImpl: typeof fetch): ReturnType<typeof createApiClient> {
  const options: ApiClientOptions = {
    baseUrl: 'https://api.iexcel.test',
    tokenProvider: {
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
      refreshAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
    },
    fetchImpl,
  };
  return createApiClient(options);
}

function mockOkFetch(body: unknown): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    })
  );
}

describe('Audit Endpoints', () => {
  describe('queryAuditLog', () => {
    it('should call GET /audit with snake_case query params', async () => {
      const response = { data: [], total: 0, page: 1, limit: 50, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.queryAuditLog({
        entityType: 'task',
        userId: 'user-001',
        dateFrom: '2026-01-01',
        dateTo: '2026-03-01',
        page: 1,
        limit: 50,
      });

      expect(result).toEqual(response);
      const url = new URL(
        (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      );
      expect(url.pathname).toBe('/audit');
      expect(url.searchParams.get('entity_type')).toBe('task');
      expect(url.searchParams.get('user_id')).toBe('user-001');
      expect(url.searchParams.get('date_from')).toBe('2026-01-01');
      expect(url.searchParams.get('date_to')).toBe('2026-03-01');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('50');
    });

    it('should omit undefined params from query string', async () => {
      const response = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      await client.queryAuditLog({ entityType: 'agenda' });

      const url = new URL(
        (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      );
      expect(url.searchParams.get('entity_type')).toBe('agenda');
      expect(url.searchParams.has('user_id')).toBe(false);
      expect(url.searchParams.has('date_from')).toBe(false);
      expect(url.searchParams.has('date_to')).toBe(false);
      expect(url.searchParams.has('entity_id')).toBe(false);
      expect(url.searchParams.has('page')).toBe(false);
      expect(url.searchParams.has('limit')).toBe(false);
    });
  });
});
