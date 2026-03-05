/**
 * Custom error classes for OAuth 2.0 / OIDC error responses.
 * All extend AuthError which provides an HTTP status code and an OAuth error code.
 */

export class AuthError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }

  toJSON(): { error: string; error_description: string } {
    return {
      error: this.errorCode,
      error_description: this.message,
    };
  }
}

export class InvalidRequestError extends AuthError {
  constructor(message: string) {
    super(message, 400, 'invalid_request');
    this.name = 'InvalidRequestError';
  }
}

export class InvalidClientError extends AuthError {
  constructor(message: string = 'Client authentication failed.') {
    super(message, 401, 'invalid_client');
    this.name = 'InvalidClientError';
  }
}

export class UnauthorizedClientError extends AuthError {
  constructor(message: string = 'The client is not authorized for this grant type.') {
    super(message, 400, 'unauthorized_client');
    this.name = 'UnauthorizedClientError';
  }
}

export class InvalidGrantError extends AuthError {
  constructor(message: string = 'The authorization code or refresh token is invalid.') {
    super(message, 400, 'invalid_grant');
    this.name = 'InvalidGrantError';
  }
}

export class ExpiredTokenError extends AuthError {
  constructor(message: string = 'The token has expired.') {
    super(message, 400, 'expired_token');
    this.name = 'ExpiredTokenError';
  }
}

export class InvalidScopeError extends AuthError {
  constructor(message: string = 'The requested scope is invalid or not allowed.') {
    super(message, 400, 'invalid_scope');
    this.name = 'InvalidScopeError';
  }
}

export class UnsupportedGrantTypeError extends AuthError {
  constructor(message: string = 'The grant type is not supported.') {
    super(message, 400, 'unsupported_grant_type');
    this.name = 'UnsupportedGrantTypeError';
  }
}

export class UnsupportedResponseTypeError extends AuthError {
  constructor(message: string = 'The response type is not supported.') {
    super(message, 400, 'unsupported_response_type');
    this.name = 'UnsupportedResponseTypeError';
  }
}

export class AuthorizationPendingError extends AuthError {
  constructor(message: string = 'The user has not yet completed authentication.') {
    super(message, 400, 'authorization_pending');
    this.name = 'AuthorizationPendingError';
  }
}

export class SlowDownError extends AuthError {
  constructor(message: string = 'Polling too frequently. Increase interval.') {
    super(message, 400, 'slow_down');
    this.name = 'SlowDownError';
  }
}

export class AccessDeniedError extends AuthError {
  constructor(message: string = 'The request was denied.') {
    super(message, 400, 'access_denied');
    this.name = 'AccessDeniedError';
  }
}

export class UserDeactivatedError extends AuthError {
  constructor(message: string = 'Your account has been deactivated.') {
    super(message, 403, 'access_denied');
    this.name = 'UserDeactivatedError';
  }
}

export class InsufficientScopeError extends AuthError {
  constructor(message: string = 'Insufficient scope for this operation.') {
    super(message, 403, 'insufficient_scope');
    this.name = 'InsufficientScopeError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Authentication required.') {
    super(message, 401, 'invalid_token');
    this.name = 'UnauthorizedError';
  }
}
