import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTerminalTokenProvider } from '../../src/auth/terminal-token-provider.js';

// Mock @iexcel/terminal-auth
vi.mock('@iexcel/terminal-auth', () => ({
  getValidAccessToken: vi.fn(),
  AuthRequiredError: class AuthRequiredError extends Error {
    constructor(message = 'Auth required') {
      super(message);
      this.name = 'AuthRequiredError';
    }
  },
}));

import { getValidAccessToken } from '@iexcel/terminal-auth';

const mockGetValidAccessToken = vi.mocked(getValidAccessToken);

describe('createTerminalTokenProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAccessToken delegates to getValidAccessToken with interactive: true', async () => {
    mockGetValidAccessToken.mockResolvedValue('test-access-token');

    const provider = createTerminalTokenProvider();
    const token = await provider.getAccessToken();

    expect(token).toBe('test-access-token');
    expect(mockGetValidAccessToken).toHaveBeenCalledWith({
      interactive: true,
    });
  });

  it('refreshAccessToken delegates to getValidAccessToken with interactive: true', async () => {
    mockGetValidAccessToken.mockResolvedValue('refreshed-token');

    const provider = createTerminalTokenProvider();
    const token = await provider.refreshAccessToken();

    expect(token).toBe('refreshed-token');
    expect(mockGetValidAccessToken).toHaveBeenCalledWith({
      interactive: true,
    });
  });

  it('propagates AuthRequiredError from getValidAccessToken', async () => {
    const { AuthRequiredError } = await import('@iexcel/terminal-auth');
    mockGetValidAccessToken.mockRejectedValue(new AuthRequiredError());

    const provider = createTerminalTokenProvider();
    await expect(provider.getAccessToken()).rejects.toThrow('Auth required');
  });

  it('creates a new provider instance each call', () => {
    const provider1 = createTerminalTokenProvider();
    const provider2 = createTerminalTokenProvider();
    expect(provider1).not.toBe(provider2);
  });
});
