import type {
  ClientCredentialsConfig,
  ClientCredentialsClient,
} from '../types/index.js';
import { ClientCredentialsError } from '../types/index.js';
import { getDiscoveryDocument } from '../discovery/index.js';

const DEFAULT_EXPIRY_BUFFER_SECONDS = 60;

interface TokenEndpointSuccessResponse {
  access_token: string;
  token_type: string;
  expires_in?: number | undefined;
  scope?: string | undefined;
}

interface TokenEndpointErrorResponse {
  error: string;
  error_description?: string | undefined;
}

function isSuccess(body: unknown): body is TokenEndpointSuccessResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'access_token' in body &&
    typeof (body as Record<string, unknown>)['access_token'] === 'string'
  );
}

function isError(body: unknown): body is TokenEndpointErrorResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as Record<string, unknown>)['error'] === 'string'
  );
}

interface CachedToken {
  accessToken: string;
  /** Unix epoch seconds at which this token should be considered expired. */
  expiresAt: number;
}

/**
 * Creates a client credentials grant client with in-memory token caching.
 *
 * Concurrent calls to getAccessToken() are deduplicated — only one token
 * request is in-flight at a time. The cached token is returned to all
 * concurrent callers once the request completes.
 *
 * Tokens are proactively refreshed before they expire using the configured
 * expiryBufferSeconds (default 60s).
 */
export function createClientCredentialsClient(
  config: ClientCredentialsConfig
): ClientCredentialsClient {
  const {
    issuerUrl,
    clientId,
    clientSecret,
    scope,
    expiryBufferSeconds = DEFAULT_EXPIRY_BUFFER_SECONDS,
    fetchImpl = fetch,
  } = config;

  let cachedToken: CachedToken | undefined;
  let inFlightRequest: Promise<string> | undefined;

  async function fetchToken(): Promise<string> {
    let tokenEndpoint: string;
    try {
      const discovery = await getDiscoveryDocument(issuerUrl, { fetchImpl });
      tokenEndpoint = discovery.token_endpoint;
    } catch (cause) {
      throw new ClientCredentialsError(
        `Failed to resolve token endpoint for issuer ${issuerUrl}`,
        undefined,
        cause
      );
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    if (scope !== undefined) {
      params.set('scope', scope);
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
      throw new ClientCredentialsError(
        `Network error posting to token endpoint ${tokenEndpoint}`,
        undefined,
        cause
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new ClientCredentialsError(
        'Failed to parse token endpoint response as JSON',
        undefined,
        cause
      );
    }

    if (!response.ok || isError(body)) {
      const oauthError = isError(body) ? body.error : undefined;
      const description = isError(body) ? body.error_description : undefined;
      throw new ClientCredentialsError(
        description ?? `Client credentials grant failed with HTTP ${response.status}`,
        oauthError
      );
    }

    if (!isSuccess(body)) {
      throw new ClientCredentialsError(
        'Token endpoint returned an unexpected response shape'
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt =
      body.expires_in !== undefined
        ? now + body.expires_in - expiryBufferSeconds
        : now + 3600 - expiryBufferSeconds; // fallback: assume 1 hour

    cachedToken = {
      accessToken: body.access_token,
      expiresAt,
    };

    return body.access_token;
  }

  function isTokenFresh(): boolean {
    if (cachedToken === undefined) return false;
    return Math.floor(Date.now() / 1000) < cachedToken.expiresAt;
  }

  async function getAccessToken(): Promise<string> {
    if (isTokenFresh() && cachedToken !== undefined) {
      return cachedToken.accessToken;
    }

    // Deduplicate concurrent refresh requests
    if (inFlightRequest !== undefined) {
      return inFlightRequest;
    }

    inFlightRequest = fetchToken().finally(() => {
      inFlightRequest = undefined;
    });

    return inFlightRequest;
  }

  async function forceRefresh(): Promise<string> {
    cachedToken = undefined;

    // If there's already a refresh in flight, let it complete
    if (inFlightRequest !== undefined) {
      return inFlightRequest;
    }

    inFlightRequest = fetchToken().finally(() => {
      inFlightRequest = undefined;
    });

    return inFlightRequest;
  }

  return { getAccessToken, forceRefresh };
}
