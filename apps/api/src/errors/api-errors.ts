/**
 * Base API error class.
 * All API-specific errors extend this class so the error handler
 * can distinguish them from unexpected errors.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Concrete error subclasses
// ---------------------------------------------------------------------------

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiError {
  public readonly details: Record<string, unknown>;

  constructor(
    message = 'Validation failed',
    details: Record<string, unknown> = {}
  ) {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class InvalidJsonError extends ApiError {
  constructor(message = 'Invalid JSON in request body') {
    super(400, 'INVALID_JSON', message);
    this.name = 'InvalidJsonError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource conflict') {
    super(409, 'CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class UnprocessableError extends ApiError {
  constructor(message = 'Unprocessable entity') {
    super(422, 'UNPROCESSABLE', message);
    this.name = 'UnprocessableError';
  }
}

export class BadGatewayError extends ApiError {
  constructor(message = 'Bad gateway') {
    super(502, 'BAD_GATEWAY', message);
    this.name = 'BadGatewayError';
  }
}
