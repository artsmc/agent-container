/**
 * Unit tests for extract-token helper.
 * @see Feature 21 — Task 1.4
 */
import { describe, it, expect } from 'vitest';
import { extractToken } from '../helpers/extract-token.js';
import type { ToolExecutionContext } from '@mastra/core/tools';

function makeContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return { ...overrides } as ToolExecutionContext;
}

describe('extractToken', () => {
  it('returns token from MCP authInfo', () => {
    const ctx = makeContext({
      mcp: {
        extra: {
          authInfo: {
            token: 'user-token-123',
            clientId: 'test',
            scopes: [],
          },
          signal: new AbortController().signal,
          requestId: '1',
          sendNotification: (() => {}) as any,
          sendRequest: (() => {}) as any,
        },
        elicitation: { sendRequest: (() => {}) as any },
      },
    });
    expect(extractToken(ctx)).toBe('user-token-123');
  });

  it('returns null when no MCP context exists', () => {
    const ctx = makeContext({});
    expect(extractToken(ctx)).toBeNull();
  });

  it('returns null when authInfo has no token', () => {
    const ctx = makeContext({
      mcp: {
        extra: {
          authInfo: undefined as any,
          signal: new AbortController().signal,
          requestId: '1',
          sendNotification: (() => {}) as any,
          sendRequest: (() => {}) as any,
        },
        elicitation: { sendRequest: (() => {}) as any },
      },
    });
    expect(extractToken(ctx)).toBeNull();
  });

  it('extracts token from requestContext authorization header', () => {
    const requestContext = {
      get: (key: string) => {
        if (key === 'authorization') return 'Bearer my-token-456';
        return undefined;
      },
    } as any;

    const ctx = makeContext({ requestContext });
    expect(extractToken(ctx)).toBe('my-token-456');
  });

  it('extracts token from requestContext userToken key', () => {
    const requestContext = {
      get: (key: string) => {
        if (key === 'userToken') return 'direct-token-789';
        return undefined;
      },
    } as any;

    const ctx = makeContext({ requestContext });
    expect(extractToken(ctx)).toBe('direct-token-789');
  });

  it('returns null for malformed Authorization header (no Bearer prefix)', () => {
    const requestContext = {
      get: (key: string) => {
        if (key === 'authorization') return 'Basic dXNlcjpwYXNz';
        return undefined;
      },
    } as any;

    const ctx = makeContext({ requestContext });
    expect(extractToken(ctx)).toBeNull();
  });
});
