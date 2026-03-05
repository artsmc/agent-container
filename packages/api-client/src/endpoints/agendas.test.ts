import { describe, it, expect, vi } from 'vitest';
import { createApiClient } from '../core/api-client';
import type { ApiClientOptions, TokenProvider } from '../types/client-options';

function createTestClient(fetchImpl: typeof fetch): {
  client: ReturnType<typeof createApiClient>;
  tokenProvider: TokenProvider;
} {
  const tokenProvider: TokenProvider = {
    getAccessToken: vi.fn().mockResolvedValue('test-token'),
    refreshAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
  };
  const options: ApiClientOptions = {
    baseUrl: 'https://api.iexcel.test',
    tokenProvider,
    fetchImpl,
  };
  return { client: createApiClient(options), tokenProvider };
}

function mockOkFetch(body: unknown): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    })
  );
}

describe('Agenda Endpoints', () => {
  describe('listAgendas', () => {
    it('should call GET /clients/{id}/agendas', async () => {
      const response = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const { client } = createTestClient(fetchImpl);

      const result = await client.listAgendas('c-1', { page: 1 });

      expect(result).toEqual(response);
      const url = new URL(
        (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      );
      expect(url.pathname).toBe('/clients/c-1/agendas');
      expect(url.searchParams.get('page')).toBe('1');
    });
  });

  describe('createAgenda', () => {
    it('should call POST /clients/{id}/agendas with body', async () => {
      const agenda = { id: 'a-1', shortId: 'AGD-001', status: 'draft' };
      const fetchImpl = mockOkFetch(agenda);
      const { client } = createTestClient(fetchImpl);

      await client.createAgenda('c-1', {
        clientId: 'c-1',
        content: '# Meeting Notes',
        cycleStart: '2026-02-01',
        cycleEnd: '2026-02-28',
      });

      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/c-1/agendas');
    });
  });

  describe('getAgenda', () => {
    it('should call GET /agendas/{id} with short ID', async () => {
      const response = { agenda: { id: 'a-1', shortId: 'AGD-0015' }, versions: [] };
      const fetchImpl = mockOkFetch(response);
      const { client } = createTestClient(fetchImpl);

      const result = await client.getAgenda('AGD-0015');

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/agendas/AGD-0015');
    });
  });

  describe('updateAgenda', () => {
    it('should call PATCH /agendas/{id} with body', async () => {
      const fetchImpl = mockOkFetch({ id: 'a-1' });
      const { client } = createTestClient(fetchImpl);

      await client.updateAgenda('a-1', { content: '# Updated' });

      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({ content: '# Updated' });
    });
  });

  describe('finalizeAgenda', () => {
    it('should call POST /agendas/{id}/finalize', async () => {
      const fetchImpl = mockOkFetch({ id: 'a-1', status: 'finalized' });
      const { client } = createTestClient(fetchImpl);

      await client.finalizeAgenda('a-1');

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/agendas/a-1/finalize');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
    });
  });

  describe('shareAgenda', () => {
    it('should call POST /agendas/{id}/share', async () => {
      const response = {
        sharedUrl: 'https://app.iexcel.test/shared/abc',
        internalUrl: 'https://app.iexcel.test/internal/abc',
      };
      const fetchImpl = mockOkFetch(response);
      const { client } = createTestClient(fetchImpl);

      const result = await client.shareAgenda('a-1');

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/agendas/a-1/share');
    });
  });

  describe('emailAgenda', () => {
    it('should call POST /agendas/{id}/email with recipients', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: new Headers(),
        })
      );
      const { client } = createTestClient(fetchImpl);

      await client.emailAgenda('AGD-0015', {
        recipients: [{ name: 'Client Name', email: 'client@example.com' }],
      });

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/agendas/AGD-0015/email');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        recipients: [{ name: 'Client Name', email: 'client@example.com' }],
      });
    });

    it('should call POST /agendas/{id}/email without body', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: new Headers(),
        })
      );
      const { client } = createTestClient(fetchImpl);

      await client.emailAgenda('AGD-0015');

      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.body).toBeUndefined();
    });
  });

  describe('exportAgenda', () => {
    it('should call POST /agendas/{id}/export', async () => {
      const response = {
        googleDocId: 'doc-123',
        googleDocUrl: 'https://docs.google.com/document/d/doc-123',
      };
      const fetchImpl = mockOkFetch(response);
      const { client } = createTestClient(fetchImpl);

      const result = await client.exportAgenda('a-1');

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/agendas/a-1/export');
    });
  });

  describe('getSharedAgenda', () => {
    it('should call GET /shared/{token} without auth', async () => {
      const agendaData = {
        id: 'a-1',
        shortId: 'AGD-001',
        clientId: 'c-1',
        status: 'shared',
        content: '# Notes',
      };
      const fetchImpl = mockOkFetch(agendaData);
      const { client, tokenProvider } = createTestClient(fetchImpl);

      const result = await client.getSharedAgenda('share-token-xyz');

      expect(result).toEqual(agendaData);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/shared/share-token-xyz');

      // Token provider should NOT have been called
      expect(tokenProvider.getAccessToken).not.toHaveBeenCalled();

      // No Authorization header
      const headers = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .headers as Headers;
      expect(headers.has('Authorization')).toBe(false);
    });
  });
});
