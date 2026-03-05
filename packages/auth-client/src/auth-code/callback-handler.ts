import type { AuthCodeConfig, TokenSet } from '../types/index.js';
import { AuthCallbackError } from '../types/index.js';
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

function isErrorResponse(body: unknown): body is TokenEndpointErrorResponse {
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
 * Handles the OAuth2 authorization code callback.
 *
 * Validates the state parameter, extracts the authorization code from the
 * callback URL, and exchanges it for tokens at the token endpoint.
 *
 * @param config - Auth code flow configuration.
 * @param callbackUrl - The full callback URL (including query string) as
 *   received by the redirect URI handler.
 * @param expectedState - The state value stored before the redirect; must
 *   match the `state` query param in the callback URL.
 * @param codeVerifier - The PKCE code verifier from generatePkceChallenge().
 * @returns Exchanged token set.
 * @throws {AuthCallbackError} on state mismatch, missing code, or provider errors.
 */
export async function exchangeCodeForTokens(
  config: AuthCodeConfig,
  callbackUrl: string,
  expectedState: string,
  codeVerifier: string
): Promise<TokenSet> {
  const { issuerUrl, clientId, clientSecret, redirectUri, fetchImpl = fetch } =
    config;

  const url = new URL(callbackUrl);
  const params = url.searchParams;

  // Check for provider-side errors first
  const providerError = params.get('error');
  if (providerError !== null) {
    throw new AuthCallbackError(
      params.get('error_description') ?? `Provider returned error: ${providerError}`,
      'provider_error'
    );
  }

  // Validate state
  const returnedState = params.get('state');
  if (returnedState !== expectedState) {
    throw new AuthCallbackError(
      'State parameter mismatch — possible CSRF attack',
      'state_mismatch'
    );
  }

  // Extract authorization code
  const code = params.get('code');
  if (code === null || code.length === 0) {
    throw new AuthCallbackError(
      'Authorization code is missing from callback URL',
      'missing_code'
    );
  }

  // Resolve token endpoint
  let tokenEndpoint: string;
  try {
    const discovery = await getDiscoveryDocument(issuerUrl, { fetchImpl });
    tokenEndpoint = discovery.token_endpoint;
  } catch (cause) {
    throw new AuthCallbackError(
      `Failed to resolve token endpoint for issuer ${issuerUrl}`,
      'provider_error',
      cause
    );
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  if (clientSecret !== undefined) {
    body.set('client_secret', clientSecret);
  }

  let response: Response;
  try {
    response = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
  } catch (cause) {
    throw new AuthCallbackError(
      `Network error during code exchange at ${tokenEndpoint}`,
      'provider_error',
      cause
    );
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch (cause) {
    throw new AuthCallbackError(
      'Failed to parse token endpoint response as JSON',
      'provider_error',
      cause
    );
  }

  if (!response.ok || isErrorResponse(responseBody)) {
    const errCode = isErrorResponse(responseBody)
      ? responseBody.error
      : `HTTP ${response.status}`;
    const description = isErrorResponse(responseBody)
      ? responseBody.error_description
      : undefined;
    throw new AuthCallbackError(
      description ?? `Token exchange failed: ${errCode}`,
      'provider_error'
    );
  }

  if (!isSuccessResponse(responseBody)) {
    throw new AuthCallbackError(
      'Token endpoint returned an unexpected response shape',
      'provider_error'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenSet: TokenSet = {
    accessToken: responseBody.access_token,
    tokenType: responseBody.token_type,
    expiresIn: responseBody.expires_in,
    expiresAt:
      responseBody.expires_in !== undefined
        ? now + responseBody.expires_in
        : undefined,
    refreshToken: responseBody.refresh_token,
    idToken: responseBody.id_token,
    scope: responseBody.scope,
  };

  return tokenSet;
}
