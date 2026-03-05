import type { OidcDiscoveryDocument } from './discovery.js';

/**
 * Configuration for the token validator.
 */
export interface TokenValidatorConfig {
  /** Issuer URL — used to fetch discovery document and validate `iss` claim. */
  issuerUrl: string;
  /** Expected audience — validated against the `aud` claim. */
  audience: string;
  /**
   * Clock skew tolerance in seconds.
   * Defaults to 60.
   */
  clockSkewToleranceSeconds?: number | undefined;
  /**
   * Signing algorithms to accept.
   * Defaults to ['RS256', 'ES256'].
   */
  algorithms?: string[] | undefined;
  /**
   * Custom fetch implementation for JWKS retrieval.
   * Defaults to global fetch.
   */
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Configuration for the token refresh operation.
 */
export interface RefreshConfig {
  /** Issuer URL — used to resolve the token_endpoint via discovery. */
  issuerUrl: string;
  /** OAuth2 client ID. */
  clientId: string;
  /**
   * OAuth2 client secret (public clients omit this).
   */
  clientSecret?: string | undefined;
  /**
   * Custom fetch implementation.
   * Defaults to global fetch.
   */
  fetchImpl?: typeof fetch | undefined;
  /**
   * Pre-fetched discovery document to avoid a network round-trip.
   */
  discoveryDocument?: OidcDiscoveryDocument | undefined;
}

/**
 * Configuration for the Authorization Code flow with PKCE.
 */
export interface AuthCodeConfig {
  /** Issuer URL — used to resolve authorization_endpoint and token_endpoint. */
  issuerUrl: string;
  /** OAuth2 client ID. */
  clientId: string;
  /**
   * OAuth2 client secret (public/PKCE clients omit this).
   */
  clientSecret?: string | undefined;
  /** Redirect URI registered with the authorization server. */
  redirectUri: string;
  /**
   * Space-separated scope string.
   * Defaults to 'openid profile email'.
   */
  scope?: string | undefined;
  /**
   * Custom fetch implementation.
   * Defaults to global fetch.
   */
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Configuration for the Device Authorization flow (RFC 8628).
 */
export interface DeviceFlowConfig {
  /** Issuer URL — used to resolve device_authorization_endpoint and token_endpoint. */
  issuerUrl: string;
  /** OAuth2 client ID. */
  clientId: string;
  /**
   * Space-separated scope string.
   * Defaults to 'openid profile email'.
   */
  scope?: string | undefined;
  /**
   * Custom fetch implementation.
   * Defaults to global fetch.
   */
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Response from the device authorization endpoint (RFC 8628 §3.2).
 */
export interface DeviceAuthorizationResponse {
  /** The device verification code. */
  device_code: string;
  /** The end-user verification code. */
  user_code: string;
  /** The end-user verification URI on the authorization server. */
  verification_uri: string;
  /** A verification URI that includes the user_code (optional). */
  verification_uri_complete?: string | undefined;
  /** The lifetime in seconds of the device_code and user_code. */
  expires_in: number;
  /** The minimum polling interval in seconds. Defaults to 5 if absent. */
  interval?: number | undefined;
}

/**
 * Options for the device flow polling loop.
 */
export interface DeviceFlowPollOptions {
  /**
   * Callback invoked on each poll attempt with a status message.
   * Useful for updating UI or logging.
   */
  onPrompt?: ((message: string) => void) | undefined;
  /**
   * Maximum total time to poll in milliseconds.
   * Defaults to expires_in * 1000.
   */
  timeoutMs?: number | undefined;
}

/**
 * Configuration for the Client Credentials grant.
 */
export interface ClientCredentialsConfig {
  /** Issuer URL — used to resolve the token_endpoint via discovery. */
  issuerUrl: string;
  /** OAuth2 client ID. */
  clientId: string;
  /** OAuth2 client secret. */
  clientSecret: string;
  /**
   * Space-separated scope string.
   */
  scope?: string | undefined;
  /**
   * Seconds before token expiry at which to proactively refresh.
   * Defaults to 60.
   */
  expiryBufferSeconds?: number | undefined;
  /**
   * Custom fetch implementation.
   * Defaults to global fetch.
   */
  fetchImpl?: typeof fetch | undefined;
}

/**
 * The handle returned by createClientCredentialsClient.
 */
export interface ClientCredentialsClient {
  /**
   * Returns a valid access token, using cached value if still fresh.
   */
  getAccessToken(): Promise<string>;
  /**
   * Forces a token refresh regardless of expiry.
   */
  forceRefresh(): Promise<string>;
}

/**
 * Options for token storage operations.
 */
export interface StorageOptions {
  /**
   * Custom file path for the token store.
   * Defaults to ~/.iexcel/auth/tokens.json.
   */
  filePath?: string | undefined;
}
