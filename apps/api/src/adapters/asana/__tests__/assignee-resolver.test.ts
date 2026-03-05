import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveAssigneeGid,
  _clearMemberCache,
  _getMemberCache,
} from '../assignee-resolver';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockMembers = [
  { gid: 'user-gid-mark', name: 'Mark Johnson', email: 'mark@iexcel.com' },
  { gid: 'user-gid-sarah', name: 'Sarah Doe', email: 'sarah@iexcel.com' },
];

let fetchCallCount = 0;

beforeEach(() => {
  _clearMemberCache();
  fetchCallCount = 0;

  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => ({ data: mockMembers }),
  })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveAssigneeGid', () => {
  it('returns correct GID for exact name match', async () => {
    const result = await resolveAssigneeGid(
      'Mark Johnson',
      'ws-001',
      'token',
    );
    expect(result).toBe('user-gid-mark');
  });

  it('returns correct GID for case-insensitive name match', async () => {
    const result = await resolveAssigneeGid(
      'mark johnson',
      'ws-001',
      'token',
    );
    expect(result).toBe('user-gid-mark');
  });

  it('returns correct GID for email match', async () => {
    const result = await resolveAssigneeGid(
      'mark@iexcel.com',
      'ws-001',
      'token',
    );
    expect(result).toBe('user-gid-mark');
  });

  it('returns null and logs warning when no match found', async () => {
    const result = await resolveAssigneeGid(
      'Unknown Person',
      'ws-001',
      'token',
    );
    expect(result).toBeNull();
  });

  it('returns null immediately for null assignee without HTTP call', async () => {
    const result = await resolveAssigneeGid(null, 'ws-001', 'token');
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses cache on second call (HTTP called only once)', async () => {
    await resolveAssigneeGid('Mark Johnson', 'ws-001', 'token');
    await resolveAssigneeGid('Sarah Doe', 'ws-001', 'token');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after TTL expiry', async () => {
    await resolveAssigneeGid('Mark Johnson', 'ws-001', 'token');

    // Manually expire the cache entry
    const cache = _getMemberCache();
    const entry = cache.get('ws-001');
    if (entry) {
      entry.fetchedAt = Date.now() - 16 * 60 * 1000; // 16 minutes ago
    }

    await resolveAssigneeGid('Mark Johnson', 'ws-001', 'token');

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
