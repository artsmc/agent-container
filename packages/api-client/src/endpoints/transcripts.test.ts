import { describe, it, expect, vi } from 'vitest';
import { createApiClient } from '../core/api-client';
import type { ApiClientOptions } from '../types/client-options';
import { MeetingType } from '@iexcel/shared-types';

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

describe('Transcript Endpoints', () => {
  describe('listTranscripts', () => {
    it('should call GET /clients/{id}/transcripts', async () => {
      const response = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.listTranscripts('c-1', { page: 1, limit: 20 });

      expect(result).toEqual(response);
      const url = new URL(
        (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      );
      expect(url.pathname).toBe('/clients/c-1/transcripts');
      expect(url.searchParams.get('page')).toBe('1');
    });
  });

  describe('submitTranscript', () => {
    it('should call POST /clients/{id}/transcripts with body', async () => {
      const transcript = {
        id: 't-1',
        clientId: 'c-1',
        grainCallId: null,
        callType: MeetingType.ClientCall,
        callDate: '2026-03-01',
        rawTranscript: 'Hello, this is a test transcript.',
        processedAt: null,
        createdAt: '2026-03-01T00:00:00Z',
      };
      const fetchImpl = mockOkFetch(transcript);
      const client = createTestClient(fetchImpl);

      const result = await client.submitTranscript('c-1', {
        clientId: 'c-1',
        callType: MeetingType.ClientCall,
        callDate: '2026-03-01',
        rawTranscript: 'Hello, this is a test transcript.',
      });

      expect(result.id).toBe('t-1');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/c-1/transcripts');
    });
  });

  describe('getTranscript', () => {
    it('should call GET /transcripts/{id}', async () => {
      const transcript = {
        id: 't-1',
        clientId: 'c-1',
        grainCallId: null,
        callType: MeetingType.Intake,
        callDate: '2026-03-01',
        rawTranscript: 'test',
        processedAt: null,
        createdAt: '2026-03-01T00:00:00Z',
      };
      const fetchImpl = mockOkFetch(transcript);
      const client = createTestClient(fetchImpl);

      const result = await client.getTranscript('t-1');

      expect(result.id).toBe('t-1');
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/transcripts/t-1');
    });
  });
});
