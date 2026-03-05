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

describe('Workflow Endpoints', () => {
  describe('triggerIntakeWorkflow', () => {
    it('should call POST /workflows/intake with body', async () => {
      const response = {
        id: 'wf-1',
        status: 'pending',
        startedAt: '2026-03-01T00:00:00Z',
        completedAt: null,
        error: null,
      };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.triggerIntakeWorkflow({
        clientId: 'client-001',
        transcriptId: 'transcript-abc',
      });

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/workflows/intake');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        clientId: 'client-001',
        transcriptId: 'transcript-abc',
      });
    });
  });

  describe('triggerAgendaWorkflow', () => {
    it('should call POST /workflows/agenda with body', async () => {
      const response = {
        id: 'wf-2',
        status: 'pending',
        startedAt: '2026-03-01T00:00:00Z',
        completedAt: null,
        error: null,
      };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.triggerAgendaWorkflow({
        clientId: 'client-001',
        cycleStart: '2026-02-01',
        cycleEnd: '2026-02-28',
      });

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/workflows/agenda');
    });
  });

  describe('getWorkflowStatus', () => {
    it('should call GET /workflows/{id}/status', async () => {
      const response = {
        id: 'wf-xyz',
        status: 'running',
        startedAt: '2026-03-01T00:00:00Z',
        completedAt: null,
        error: null,
      };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.getWorkflowStatus('wf-xyz');

      expect(result).toEqual(response);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/workflows/wf-xyz/status');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('GET');
    });
  });
});
