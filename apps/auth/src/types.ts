/**
 * TypeScript interfaces for the auth service.
 */

// ---- Database row types ----

export interface User {
  id: string;
  idp_subject: string;
  idp_provider: string;
  email: string;
  name: string;
  picture: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface OidcClient {
  id: string;
  client_id: string;
  client_name: string;
  client_secret_hash: string | null;
  client_type: 'public' | 'confidential';
  grant_types: string[];
  redirect_uris: string[];
  scopes: string[];
  token_lifetime: number;
  refresh_token_lifetime: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  client_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  idp_session_id: string | null;
  expires_at: Date;
  created_at: Date;
}

// ---- OIDC Discovery ----

export interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  device_authorization_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
}

// ---- Token types ----

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
}

export interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

export interface AccessTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  scope: string;
  jti?: string;
  client_id?: string;
}

export interface IdTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  email?: string;
  name?: string;
  picture?: string;
  nonce?: string;
}

// ---- Device flow ----

export type DeviceFlowStatus = 'pending' | 'complete' | 'denied' | 'expired';

export interface DeviceFlowRecord {
  deviceCode: string;
  userCode: string;
  clientId: string;
  scope: string;
  status: DeviceFlowStatus;
  userId: string | null;
  expiresAt: Date;
  lastPolledAt: Date | null;
  createdAt: Date;
}

export interface DeviceAuthorizeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

// ---- Authorization code ----

export interface AuthCodeRecord {
  code: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string;
  nonce: string | null;
  expiresAt: Date;
  used: boolean;
}

// ---- IdP claims ----

export interface IdpClaims {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  idpProvider: string;
}

// ---- IdP discovery ----

export interface IdpDiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint: string;
  issuer: string;
}

// ---- Authorization request session (stored in cookie) ----

export interface AuthorizationRequestSession {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
  /** If present, indicates device flow -- the device code to resolve */
  deviceCode: string | null;
  createdAt: number;
}

// ---- Admin types ----

export interface ClientResponse {
  id: string;
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  grant_types: string[];
  redirect_uris: string[];
  scopes: string[];
  token_lifetime: number;
  refresh_token_lifetime: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClientRequest {
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  grant_types: string[];
  redirect_uris: string[];
  scopes: string[];
  token_lifetime?: number;
  refresh_token_lifetime?: number;
}

export interface UpdateClientRequest {
  client_name?: string;
  grant_types?: string[];
  redirect_uris?: string[];
  scopes?: string[];
  token_lifetime?: number;
  refresh_token_lifetime?: number;
  is_active?: boolean;
}

export interface ListUsersParams {
  isActive?: boolean;
  limit: number;
  offset: number;
}

export interface UserListResponse {
  users: UserSummary[];
  total: number;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  idp_provider: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface UserDetailResponse {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  idp_provider: string;
  idp_subject: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  active_sessions: number;
  active_refresh_tokens: number;
}

// ---- Fastify request extensions ----

export interface AuthenticatedUser {
  sub: string;
  scope: string;
  clientId?: string;
}
