/**
 * Subset of the OIDC Discovery Document (RFC 8414 / OpenID Connect Discovery 1.0).
 * Contains the fields consumed by this package.
 */
export interface OidcDiscoveryDocument {
  /** URL using the https scheme that the OP asserts as its Issuer Identifier. */
  issuer: string;
  /** URL of the OP's OAuth 2.0 Authorization Endpoint. */
  authorization_endpoint: string;
  /** URL of the OP's OAuth 2.0 Token Endpoint. */
  token_endpoint: string;
  /** URL of the OP's JSON Web Key Set [JWK] document. */
  jwks_uri: string;
  /** URL of the OP's UserInfo Endpoint. */
  userinfo_endpoint?: string | undefined;
  /** URL of the OP's OAuth 2.0 Device Authorization Endpoint. */
  device_authorization_endpoint?: string | undefined;
  /** URL of the OP's OAuth 2.0 Revocation Endpoint. */
  revocation_endpoint?: string | undefined;
  /** URL of the OP's OAuth 2.0 Introspection Endpoint. */
  introspection_endpoint?: string | undefined;
  /** JSON array of the OAuth 2.0 response_type values that this OP supports. */
  response_types_supported: string[];
  /** JSON array of the OAuth 2.0 grant types that this OP supports. */
  grant_types_supported?: string[] | undefined;
  /** JSON array of the Subject Identifier types that this OP supports. */
  subject_types_supported: string[];
  /** JSON array of the JWS signing algorithms (alg values) supported. */
  id_token_signing_alg_values_supported: string[];
  /** JSON array of the OAuth 2.0 scope values that this server supports. */
  scopes_supported?: string[] | undefined;
  /** JSON array of the Claim Names of the Claims that the OP MAY supply. */
  claims_supported?: string[] | undefined;
  /** JSON array of PKCE code challenge methods supported. */
  code_challenge_methods_supported?: string[] | undefined;
}

/**
 * Options for fetching the OIDC discovery document.
 */
export interface DiscoveryOptions {
  /**
   * Custom fetch implementation for testing or environments without global fetch.
   * Defaults to the global fetch.
   */
  fetchImpl?: typeof fetch | undefined;
  /**
   * Cache TTL in milliseconds.
   * Defaults to 3600000 (1 hour).
   */
  cacheTtlMs?: number | undefined;
}
