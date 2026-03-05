import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveEnumOptionGid,
  _clearEnumCache,
  _getEnumCache,
} from '../custom-field-resolver';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockEnumOptions = [
  { gid: 'enum-gid-tl', name: 'Total Life' },
  { gid: 'enum-gid-acme', name: 'Acme Corp' },
  { gid: 'enum-gid-backlog', name: 'Backlog' },
  { gid: 'enum-gid-inprog', name: 'In Progress' },
];

beforeEach(() => {
  _clearEnumCache();

  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => ({ data: { enum_options: mockEnumOptions } }),
  })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveEnumOptionGid', () => {
  it('returns correct GID for exact display name match', async () => {
    const result = await resolveEnumOptionGid(
      'cf-field-001',
      'Total Life',
      'token',
      'Client',
    );
    expect(result).toBe('enum-gid-tl');
  });

  it('returns correct GID for case-insensitive match', async () => {
    const result = await resolveEnumOptionGid(
      'cf-field-001',
      'total life',
      'token',
      'Client',
    );
    expect(result).toBe('enum-gid-tl');
  });

  it('returns null and logs warning when no match found', async () => {
    const result = await resolveEnumOptionGid(
      'cf-field-001',
      'Unknown Client',
      'token',
      'Client',
    );
    expect(result).toBeNull();
  });

  it('uses cache on second call (HTTP called only once)', async () => {
    await resolveEnumOptionGid('cf-field-001', 'Total Life', 'token', 'Client');
    await resolveEnumOptionGid('cf-field-001', 'Acme Corp', 'token', 'Client');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after TTL expiry', async () => {
    await resolveEnumOptionGid('cf-field-001', 'Total Life', 'token', 'Client');

    // Manually expire the cache entry
    const cache = _getEnumCache();
    const entry = cache.get('cf-field-001');
    if (entry) {
      entry.fetchedAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago
    }

    await resolveEnumOptionGid('cf-field-001', 'Total Life', 'token', 'Client');

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
