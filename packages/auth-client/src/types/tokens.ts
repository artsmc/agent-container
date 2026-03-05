/**
 * Represents a set of OAuth2 tokens returned from a token endpoint.
 */
export interface TokenSet {
  /** The access token for API requests. */
  accessToken: string;
  /** The refresh token (may be absent for short-lived grants). */
  refreshToken?: string | undefined;
  /** The ID token (OIDC flows only). */
  idToken?: string | undefined;
  /** Token type, typically "Bearer". */
  tokenType: string;
  /** Number of seconds until the access token expires. */
  expiresIn?: number | undefined;
  /** Absolute expiry timestamp (Unix epoch seconds) computed at receipt. */
  expiresAt?: number | undefined;
  /** Scopes granted by the authorization server. */
  scope?: string | undefined;
}

/**
 * Tokens persisted to local storage, enriched with metadata for
 * cache validity checks and session tracking.
 */
export interface StoredTokens extends TokenSet {
  /** ISO 8601 timestamp when the tokens were stored. */
  storedAt: string;
  /** The issuer URL these tokens were issued by. */
  issuer: string;
  /** The client_id these tokens belong to. */
  clientId: string;
}

/**
 * Claims extracted from a validated OIDC JWT.
 * Extends the minimal set required by the auth service.
 */
export interface TokenClaims {
  /** Token issuer. */
  iss: string;
  /** Subject (user identifier). */
  sub: string;
  /** Audience — may be a string or array of strings. */
  aud: string | string[];
  /** Issued-at timestamp (Unix epoch seconds). */
  iat: number;
  /** Expiry timestamp (Unix epoch seconds). */
  exp: number;
  /** User's email address (optional, present in OIDC ID tokens). */
  email?: string | undefined;
  /** User's display name (optional). */
  name?: string | undefined;
  /** JWT ID — unique identifier for the token. */
  jti?: string | undefined;
  /** Additional custom claims. */
  [key: string]: unknown;
}
