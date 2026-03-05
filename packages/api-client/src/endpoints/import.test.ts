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

describe('Import Endpoints', () => {
  describe('triggerImport', () => {
    it('should call POST /clients/{id}/import with body', async () => {
      const response = {
        jobId: 'job-1',
        status: 'pending',
        startedAt: null,
        completedAt: null,
        error: null,
      };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.triggerImport('c-1', {
        grainPlaylistId: 'playlist-abc',
      });

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/c-1/import');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
    });
  });

  describe('getImportStatus', () => {
    it('should call GET /clients/{id}/import/status', async () => {
      const response = {
        jobId: 'job-1',
        status: 'running',
        startedAt: '2026-03-01T00:00:00Z',
        completedAt: null,
        error: null,
      };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.getImportStatus('c-1');

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/c-1/import/status');
    });
  });
});
