/**
 * Base error class for all auth-client errors.
 * All errors in this package extend this class.
 */
export class AuthClientError extends Error {
  public readonly code: string;
  public override readonly cause: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'AuthClientError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when OIDC discovery document retrieval fails.
 */
export class DiscoveryError extends AuthClientError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DISCOVERY_ERROR', cause);
    this.name = 'DiscoveryError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type TokenValidationErrorReason =
  | 'expired'
  | 'invalid_signature'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'invalid_claims'
  | 'malformed'
  | 'unknown';

/**
 * Thrown when JWT validation fails.
 */
export class TokenValidationError extends AuthClientError {
  public readonly reason: TokenValidationErrorReason;

  constructor(
    message: string,
    reason: TokenValidationErrorReason,
    cause?: unknown
  ) {
    super(message, 'TOKEN_VALIDATION_ERROR', cause);
    this.name = 'TokenValidationError';
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when token refresh fails.
 */
export class TokenRefreshError extends AuthClientError {
  public readonly oauthError: string | undefined;

  constructor(message: string, oauthError?: string, cause?: unknown) {
    super(message, 'TOKEN_REFRESH_ERROR', cause);
    this.name = 'TokenRefreshError';
    this.oauthError = oauthError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type AuthCallbackErrorReason =
  | 'state_mismatch'
  | 'provider_error'
  | 'missing_code';

/**
 * Thrown when the OAuth2 authorization code callback fails.
 */
export class AuthCallbackError extends AuthClientError {
  public readonly reason: AuthCallbackErrorReason;

  constructor(
    message: string,
    reason: AuthCallbackErrorReason,
    cause?: unknown
  ) {
    super(message, 'AUTH_CALLBACK_ERROR', cause);
    this.name = 'AuthCallbackError';
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type DeviceFlowErrorReason =
  | 'expired'
  | 'access_denied'
  | 'timeout'
  | 'slow_down';

/**
 * Thrown when the Device Authorization flow fails.
 */
export class DeviceFlowError extends AuthClientError {
  public readonly reason: DeviceFlowErrorReason;

  constructor(
    message: string,
    reason: DeviceFlowErrorReason,
    cause?: unknown
  ) {
    super(message, 'DEVICE_FLOW_ERROR', cause);
    this.name = 'DeviceFlowError';
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when client credentials grant fails.
 */
export class ClientCredentialsError extends AuthClientError {
  public readonly oauthError: string | undefined;

  constructor(message: string, oauthError?: string, cause?: unknown) {
    super(message, 'CLIENT_CREDENTIALS_ERROR', cause);
    this.name = 'ClientCredentialsError';
    this.oauthError = oauthError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when token storage operations fail.
 */
export class TokenStorageError extends AuthClientError {
  constructor(message: string, cause?: unknown) {
    super(message, 'TOKEN_STORAGE_ERROR', cause);
    this.name = 'TokenStorageError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
