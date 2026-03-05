import type { RefreshConfig, TokenSet } from '../types/index.js';
import { TokenRefreshError } from '../types/index.js';
import { getDiscoveryDocument } from '../discovery/index.js';

interface TokenEndpointErrorResponse {
  error: string;
  error_description?: string | undefined;
}

interface TokenEndpointSuccessResponse {
  access_token: string;
  token_type: string;
  expires_in?: number | undefined;
  refresh_token?: string | undefined;
  id_token?: string | undefined;
  scope?: string | undefined;
}

function isErrorResponse(
  body: unknown
): body is TokenEndpointErrorResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as Record<string, unknown>)['error'] === 'string'
  );
}

function isSuccessResponse(
  body: unknown
): body is TokenEndpointSuccessResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'access_token' in body &&
    typeof (body as Record<string, unknown>)['access_token'] === 'string'
  );
}

/**
 * Exchanges a refresh token for a new TokenSet.
 * Handles rotated refresh tokens — if the server returns a new refresh_token
 * it is included in the returned TokenSet.
 *
 * @throws {TokenRefreshError} when the token endpoint returns an error or
 *   the network request fails.
 */
export async function refreshAccessToken(
  config: RefreshConfig,
  refreshToken: string
): Promise<TokenSet> {
  const {
    issuerUrl,
    clientId,
    clientSecret,
    fetchImpl = fetch,
    discoveryDocument,
  } = config;

  let tokenEndpoint: string;
  try {
    const discovery =
      discoveryDocument ?? (await getDiscoveryDocument(issuerUrl, { fetchImpl }));
    tokenEndpoint = discovery.token_endpoint;
  } catch (cause) {
    throw new TokenRefreshError(
      `Failed to resolve token endpoint for issuer ${issuerUrl}`,
      undefined,
      cause
    );
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  if (clientSecret !== undefined) {
    params.set('client_secret', clientSecret);
  }

  let response: Response;
  try {
    response = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });
  } catch (cause) {
    throw new TokenRefreshError(
      `Network error posting to token endpoint ${tokenEndpoint}`,
      undefined,
      cause
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new TokenRefreshError(
      `Failed to parse token endpoint response as JSON`,
      undefined,
      cause
    );
  }

  if (!response.ok || isErrorResponse(body)) {
    const oauthError = isErrorResponse(body) ? body.error : undefined;
    const description = isErrorResponse(body)
      ? body.error_description
      : undefined;
    throw new TokenRefreshError(
      description ?? `Token refresh failed with HTTP ${response.status}`,
      oauthError
    );
  }

  if (!isSuccessResponse(body)) {
    throw new TokenRefreshError(
      'Token endpoint returned an unexpected response shape'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenSet: TokenSet = {
    accessToken: body.access_token,
    tokenType: body.token_type,
    expiresIn: body.expires_in,
    expiresAt:
      body.expires_in !== undefined ? now + body.expires_in : undefined,
    refreshToken: body.refresh_token ?? refreshToken,
    idToken: body.id_token,
    scope: body.scope,
  };

  return tokenSet;
}
