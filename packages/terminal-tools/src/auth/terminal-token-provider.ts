/**
 * Adapts the terminal-auth token manager into the TokenProvider
 * interface expected by @iexcel/api-client.
 *
 * This allows any code in the terminal tools package to create an
 * ApiClient instance backed by the device-flow tokens from Feature 32.
 */

import { getValidAccessToken } from '@iexcel/terminal-auth';
import type { TokenProvider } from '@iexcel/api-client';

/**
 * Creates a TokenProvider that delegates to terminal-auth's
 * getValidAccessToken(). Token refresh is handled internally
 * by terminal-auth — calling getValidAccessToken again forces
 * re-evaluation of token validity.
 *
 * When interactive is true (default), missing or expired tokens
 * will trigger the device authorization flow automatically.
 */
export function createTerminalTokenProvider(): TokenProvider {
  return {
    async getAccessToken(): Promise<string> {
      return getValidAccessToken({ interactive: true });
    },
    async refreshAccessToken(): Promise<string> {
      // getValidAccessToken handles refresh internally.
      // Calling it again forces re-evaluation of token validity.
      return getValidAccessToken({ interactive: true });
    },
  };
}
