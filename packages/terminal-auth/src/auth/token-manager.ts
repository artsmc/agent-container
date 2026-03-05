import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadTokens, saveTokens, clearTokens } from '@iexcel/auth-client/token-storage';
import { refreshAccessToken } from '@iexcel/auth-client/refresh';
import { TokenRefreshError } from '@iexcel/auth-client/types';
import { config } from '../config/config.js';
import { login } from '../commands/login.js';
import { AuthRequiredError } from '../errors/index.js';
import type { StoredTokensWithProfile } from '../types/index.js';

/**
 * Options for getValidAccessToken.
 */
export interface GetValidAccessTokenOptions {
  /**
   * When true and no valid session exists, the function will trigger an
   * interactive login flow instead of throwing AuthRequiredError.
   * Defaults to false.
   */
  interactive?: boolean;
}

/**
 * Resolves a path that may start with ~ to an absolute path using the home
 * directory.
 */
function resolveTokenPath(tokenPath: string): string {
  if (tokenPath.startsWith('~/') || tokenPath === '~') {
    return join(homedir(), tokenPath.slice(1));
  }
  return tokenPath;
}

/**
 * Returns true when the stored access token is still valid (not expiring
 * within the refresh buffer window).
 */
function isAccessTokenFresh(tokens: StoredTokensWithProfile): boolean {
  if (tokens.expiresAt === undefined) {
    // No expiry information — assume the token is still valid
    return true;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return tokens.expiresAt > nowSeconds + config.refreshBufferSeconds;
}

/**
 * Deduplicated in-flight refresh promise.
 * Prevents multiple concurrent callers from each firing a refresh request.
 */
let inflightRefresh: Promise<string> | null = null;

/**
 * Returns a valid access token, refreshing or re-authenticating as needed.
 *
 * Resolution order:
 * 1. Return the cached access token if it has not yet reached the refresh
 *    buffer threshold.
 * 2. Attempt a silent token refresh using the stored refresh token.
 * 3. If refresh fails with invalid_grant (revoked/expired refresh token):
 *    - Clear stored tokens.
 *    - Trigger interactive login if `options.interactive` is true.
 *    - Otherwise throw AuthRequiredError.
 * 4. If a network error occurs during refresh:
 *    - Return the existing access token if it has not fully expired yet.
 *    - Otherwise handle per the interactive flag.
 *
 * Concurrent calls are deduplicated — only one refresh request is in flight
 * at any time.
 *
 * @throws {AuthRequiredError} when not interactive and no valid token exists.
 */
export async function getValidAccessToken(
  options?: GetValidAccessTokenOptions
): Promise<string> {
  // Deduplicate concurrent refresh attempts
  if (inflightRefresh !== null) {
    return inflightRefresh;
  }

  inflightRefresh = _getValidAccessToken(options);
  try {
    return await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
}

async function _getValidAccessToken(
  options?: GetValidAccessTokenOptions
): Promise<string> {
  const interactive = options?.interactive ?? false;
  const filePath = resolveTokenPath(config.tokenPath);

  const tokens = await loadTokens({ filePath });

  // No session stored
  if (tokens === null) {
    if (interactive) {
      const freshTokens = await login();
      return freshTokens.accessToken;
    }
    throw new AuthRequiredError();
  }

  const tokensWithProfile = tokens as StoredTokensWithProfile;

  // Access token is still fresh — return immediately
  if (isAccessTokenFresh(tokensWithProfile)) {
    return tokensWithProfile.accessToken;
  }

  // Access token is stale — try silent refresh
  if (tokensWithProfile.refreshToken === undefined) {
    // No refresh token available
    if (interactive) {
      const freshTokens = await login();
      return freshTokens.accessToken;
    }
    throw new AuthRequiredError('Session expired. Please run login.');
  }

  try {
    const refreshedTokenSet = await refreshAccessToken(
      {
        issuerUrl: config.issuerUrl,
        clientId: config.clientId,
      },
      tokensWithProfile.refreshToken
    );

    // Persist refreshed tokens, preserving the existing user profile
    const now = Math.floor(Date.now() / 1000);
    const expiresAt =
      refreshedTokenSet.expiresAt ??
      (refreshedTokenSet.expiresIn !== undefined
        ? now + refreshedTokenSet.expiresIn
        : undefined);

    const updatedTokens: StoredTokensWithProfile = {
      ...tokensWithProfile,
      accessToken: refreshedTokenSet.accessToken,
      tokenType: refreshedTokenSet.tokenType,
      refreshToken: refreshedTokenSet.refreshToken ?? tokensWithProfile.refreshToken,
      idToken: refreshedTokenSet.idToken ?? tokensWithProfile.idToken,
      expiresIn: refreshedTokenSet.expiresIn,
      expiresAt,
      scope: refreshedTokenSet.scope ?? tokensWithProfile.scope,
      storedAt: new Date().toISOString(),
    };

    await saveTokens(updatedTokens, { filePath });

    return updatedTokens.accessToken;
  } catch (err) {
    if (err instanceof TokenRefreshError) {
      // invalid_grant: refresh token is revoked or expired
      if (err.oauthError === 'invalid_grant') {
        await clearTokens({ filePath });

        if (interactive) {
          const freshTokens = await login();
          return freshTokens.accessToken;
        }
        throw new AuthRequiredError('Session expired. Please run login.');
      }

      // Network or transient error: return existing token if it has not fully
      // expired (ignoring the refresh buffer)
      const nowSeconds = Math.floor(Date.now() / 1000);
      const isStillValid =
        tokensWithProfile.expiresAt === undefined ||
        tokensWithProfile.expiresAt > nowSeconds;

      if (isStillValid) {
        return tokensWithProfile.accessToken;
      }

      // Token is fully expired and we cannot refresh
      if (interactive) {
        const freshTokens = await login();
        return freshTokens.accessToken;
      }
      throw new AuthRequiredError('Session expired and refresh failed. Please run login.');
    }

    // Unknown error — re-throw
    throw err;
  }
}
