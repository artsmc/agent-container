/**
 * Unit tests for resolve-client helper.
 * @see Feature 21 — Task 1.6
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveClient,
  ClientNotFoundError,
  AmbiguousClientError,
} from '../helpers/resolve-client.js';
import type { ApiClient } from '@iexcel/api-client';

function makeMockClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getClient: vi.fn(),
    listClients: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('resolveClient', () => {
  it('resolves a UUID directly via getClient', async () => {
    const client = makeMockClient({
      getClient: vi.fn().mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Total Life',
      }),
    });

    const result = await resolveClient(
      client,
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(result).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Total Life',
    });
    expect(client.getClient).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('resolves a name with single match', async () => {
    const client = makeMockClient({
      listClients: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc-123', name: 'Total Life' },
        ],
        total: 1,
        page: 1,
        limit: 10,
        hasMore: false,
      }),
    });

    const result = await resolveClient(client, 'Total Life');
    expect(result).toEqual({ id: 'abc-123', name: 'Total Life' });
  });

  it('resolves a name case-insensitively', async () => {
    const client = makeMockClient({
      listClients: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc-123', name: 'Total Life' },
        ],
        total: 1,
        page: 1,
        limit: 10,
        hasMore: false,
      }),
    });

    const result = await resolveClient(client, 'total life');
    expect(result).toEqual({ id: 'abc-123', name: 'Total Life' });
  });

  it('throws ClientNotFoundError when no match', async () => {
    const client = makeMockClient({
      listClients: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc-123', name: 'Acme Corp' },
        ],
        total: 1,
        page: 1,
        limit: 10,
        hasMore: false,
      }),
    });

    await expect(resolveClient(client, 'Unknown Corp')).rejects.toThrow(
      ClientNotFoundError,
    );
  });

  it('throws AmbiguousClientError when multiple exact matches', async () => {
    const client = makeMockClient({
      listClients: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc-1', name: 'Total Life' },
          { id: 'abc-2', name: 'Total Life' },
        ],
        total: 2,
        page: 1,
        limit: 10,
        hasMore: false,
      }),
    });

    await expect(resolveClient(client, 'Total Life')).rejects.toThrow(
      AmbiguousClientError,
    );
  });

  it('resolves partial match when exactly one matches', async () => {
    const client = makeMockClient({
      listClients: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc-123', name: 'Total Life Coaching' },
          { id: 'def-456', name: 'Acme Corp' },
        ],
        total: 2,
        page: 1,
        limit: 10,
        hasMore: false,
      }),
    });

    // "Total" partially matches only "Total Life Coaching"
    const result = await resolveClient(client, 'Total');
    expect(result).toEqual({ id: 'abc-123', name: 'Total Life Coaching' });
  });

  it('throws AmbiguousClientError when multiple partial matches', async () => {
    const client = makeMockClient({
      listClients: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc-1', name: 'Total Life A' },
          { id: 'abc-2', name: 'Total Life B' },
        ],
        total: 2,
        page: 1,
        limit: 10,
        hasMore: false,
      }),
    });

    await expect(resolveClient(client, 'Total')).rejects.toThrow(
      AmbiguousClientError,
    );
  });
});
