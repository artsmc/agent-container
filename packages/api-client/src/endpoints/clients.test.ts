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

describe('Client Endpoints', () => {
  describe('listClients', () => {
    it('should call GET /clients with pagination params', async () => {
      const response = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.listClients({ page: 1, limit: 20 });

      expect(result).toEqual(response);
      const url = new URL(
        (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      );
      expect(url.pathname).toBe('/clients');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('20');
    });

    it('should call GET /clients without params', async () => {
      const response = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      await client.listClients();

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients');
    });
  });

  describe('getClient', () => {
    it('should call GET /clients/{id}', async () => {
      const clientData = {
        id: 'c-1',
        name: 'Test Client',
        grainPlaylistId: null,
        defaultAsanaWorkspaceId: null,
        defaultAsanaProjectId: null,
        emailRecipients: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      const fetchImpl = mockOkFetch(clientData);
      const client = createTestClient(fetchImpl);

      const result = await client.getClient('c-1');

      expect(result).toEqual(clientData);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/c-1');
    });
  });

  describe('updateClient', () => {
    it('should call PATCH /clients/{id} with body', async () => {
      const updatedClient = { id: 'c-1', name: 'Updated' };
      const fetchImpl = mockOkFetch(updatedClient);
      const client = createTestClient(fetchImpl);

      await client.updateClient('c-1', { name: 'Updated' });

      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({ name: 'Updated' });
    });
  });

  describe('getClientStatus', () => {
    it('should call GET /clients/{id}/status', async () => {
      const statusData = {
        clientId: 'c-1',
        pendingApprovals: 5,
        agendaReady: true,
        nextCallDate: '2026-03-15',
      };
      const fetchImpl = mockOkFetch(statusData);
      const client = createTestClient(fetchImpl);

      const result = await client.getClientStatus('c-1');

      expect(result).toEqual(statusData);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/c-1/status');
    });
  });
});
