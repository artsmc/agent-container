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

describe('Asana Endpoints', () => {
  describe('listAsanaWorkspaces', () => {
    it('should call GET /asana/workspaces', async () => {
      const workspaces = [
        {
          id: 'w-1',
          asanaWorkspaceId: 'asana-123',
          name: 'My Workspace',
          accessTokenRef: 'ref-abc',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      const fetchImpl = mockOkFetch(workspaces);
      const client = createTestClient(fetchImpl);

      const result = await client.listAsanaWorkspaces();

      expect(result).toEqual(workspaces);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/asana/workspaces');
    });
  });

  describe('addAsanaWorkspace', () => {
    it('should call POST /asana/workspaces with body', async () => {
      const workspace = {
        id: 'w-1',
        asanaWorkspaceId: 'asana-123',
        name: 'My Workspace',
        accessTokenRef: 'ref-abc',
        createdAt: '2026-01-01T00:00:00Z',
      };
      const fetchImpl = mockOkFetch(workspace);
      const client = createTestClient(fetchImpl);

      const result = await client.addAsanaWorkspace({
        asanaWorkspaceId: 'asana-123',
        name: 'My Workspace',
        accessToken: 'secret-token',
      });

      expect(result).toEqual(workspace);
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
    });
  });

  describe('deleteAsanaWorkspace', () => {
    it('should call DELETE /asana/workspaces/{id} and return void', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: new Headers(),
        })
      );
      const client = createTestClient(fetchImpl);

      const result = await client.deleteAsanaWorkspace('workspace-001');

      expect(result).toBeUndefined();
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/asana/workspaces/workspace-001');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('DELETE');
    });
  });
});
