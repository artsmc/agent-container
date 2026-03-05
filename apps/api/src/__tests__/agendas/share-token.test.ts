import { describe, it, expect } from 'vitest';
import { generateShareToken, buildShareUrls } from '../../utils/share-token';

// ---------------------------------------------------------------------------
// Share token generation
// ---------------------------------------------------------------------------

describe('generateShareToken', () => {
  it('produces a 43-character string', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(43);
  });

  it('produces URL-safe characters only', () => {
    const token = generateShareToken();
    // base64url: [A-Za-z0-9_-], no padding
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces unique tokens', () => {
    const token1 = generateShareToken();
    const token2 = generateShareToken();
    expect(token1).not.toBe(token2);
  });
});

// ---------------------------------------------------------------------------
// Share URL builder
// ---------------------------------------------------------------------------

describe('buildShareUrls', () => {
  it('constructs correct URLs from APP_BASE_URL', () => {
    const originalEnv = process.env['APP_BASE_URL'];
    process.env['APP_BASE_URL'] = 'https://app.example.com';

    try {
      const urls = buildShareUrls({
        shared_url_token: 'shared-token-123',
        internal_url_token: 'internal-token-456',
      });

      expect(urls.client_url).toBe('https://app.example.com/shared/shared-token-123');
      expect(urls.internal_url).toBe('https://app.example.com/agendas/edit/internal-token-456');
    } finally {
      if (originalEnv !== undefined) {
        process.env['APP_BASE_URL'] = originalEnv;
      } else {
        delete process.env['APP_BASE_URL'];
      }
    }
  });

  it('throws when APP_BASE_URL is not set', () => {
    const originalEnv = process.env['APP_BASE_URL'];
    delete process.env['APP_BASE_URL'];

    try {
      expect(() => buildShareUrls({
        shared_url_token: 'token',
        internal_url_token: 'token',
      })).toThrow('APP_BASE_URL');
    } finally {
      if (originalEnv !== undefined) {
        process.env['APP_BASE_URL'] = originalEnv;
      }
    }
  });
});
