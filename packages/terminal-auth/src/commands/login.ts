import { homedir } from 'node:os';
import { join } from 'node:path';
import { decodeJwt } from 'jose';
import { initiateDeviceFlow } from '@iexcel/auth-client/device-flow';
import { pollDeviceToken } from '@iexcel/auth-client/device-flow';
import { loadTokens, saveTokens } from '@iexcel/auth-client/token-storage';
import { DeviceFlowError } from '@iexcel/auth-client/types';
import { config } from '../config/config.js';
import { print, printError } from '../display/terminal-output.js';
import type { StoredTokensWithProfile, UserProfile } from '../types/index.js';

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
 * Returns true when the stored tokens are present and the access token is not
 * expiring within the refresh buffer window.
 */
function isSessionValid(tokens: StoredTokensWithProfile): boolean {
  if (tokens.expiresAt === undefined) {
    // No expiry information — treat as valid
    return true;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return tokens.expiresAt > nowSeconds + config.refreshBufferSeconds;
}

/**
 * Initiates a Device Authorization Flow, waits for the user to complete
 * authentication in their browser, then persists the resulting tokens to disk.
 *
 * If a valid, non-expiring session already exists, the existing tokens are
 * returned immediately without starting a new flow.
 *
 * @returns The stored tokens enriched with the authenticated user profile.
 */
export async function login(): Promise<StoredTokensWithProfile> {
  const filePath = resolveTokenPath(config.tokenPath);

  // Check for an existing valid session
  const existing = await loadTokens({ filePath });
  if (existing !== null) {
    const existingWithProfile = existing as StoredTokensWithProfile;
    if (
      existingWithProfile.user !== undefined &&
      isSessionValid(existingWithProfile)
    ) {
      print(`Already authenticated as ${existingWithProfile.user.email}`);
      return existingWithProfile;
    }
  }

  // Initiate the device authorization flow
  const flowConfig = {
    issuerUrl: config.issuerUrl,
    clientId: config.clientId,
    scope: config.scopes.join(' '),
  };

  const deviceAuth = await initiateDeviceFlow(flowConfig);

  print(`Visit: ${deviceAuth.verification_uri}`);
  print(`Enter code: ${deviceAuth.user_code}`);

  // Poll the token endpoint until the user completes authorization
  let tokenSet;
  try {
    tokenSet = await pollDeviceToken(
      flowConfig,
      deviceAuth.device_code,
      deviceAuth.interval ?? 5,
      deviceAuth.expires_in,
      {
        onPrompt: (message) => print(message),
      }
    );
  } catch (err) {
    if (err instanceof DeviceFlowError) {
      switch (err.reason) {
        case 'expired':
          printError('The device code expired before authorization was completed. Please try again.');
          break;
        case 'access_denied':
          printError('Authorization was denied. Please try again.');
          break;
        case 'timeout':
          printError('Timed out waiting for authorization. Please try again.');
          break;
        default:
          printError(`Authorization failed: ${err.message}`);
      }
    } else {
      printError(`Unexpected error during authorization: ${String(err)}`);
    }
    throw err;
  }

  // Decode the id_token to extract user profile claims
  if (tokenSet.idToken === undefined) {
    throw new Error('No id_token returned from authorization server. Cannot extract user profile.');
  }

  const claims = decodeJwt(tokenSet.idToken);

  const user: UserProfile = {
    sub: typeof claims['sub'] === 'string' ? claims['sub'] : '',
    email: typeof claims['email'] === 'string' ? claims['email'] : '',
    name: typeof claims['name'] === 'string' ? claims['name'] : '',
  };

  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    tokenSet.expiresAt ??
    (tokenSet.expiresIn !== undefined ? now + tokenSet.expiresIn : undefined);

  const storedTokens: StoredTokensWithProfile = {
    accessToken: tokenSet.accessToken,
    tokenType: tokenSet.tokenType,
    refreshToken: tokenSet.refreshToken,
    idToken: tokenSet.idToken,
    expiresIn: tokenSet.expiresIn,
    expiresAt,
    scope: tokenSet.scope,
    storedAt: new Date().toISOString(),
    issuer: config.issuerUrl,
    clientId: config.clientId,
    user,
  };

  await saveTokens(storedTokens, { filePath });

  print(`Authenticated as ${user.email}`);

  return storedTokens;
}
