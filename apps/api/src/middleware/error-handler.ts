import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ApiError, ValidationError, BusinessError } from '../errors/api-errors';

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Builds a standardised error response envelope.
 */
function buildErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ErrorResponseBody {
  const body: ErrorResponseBody = {
    success: false,
    error: { code, message },
  };
  if (details && Object.keys(details).length > 0) {
    body.error.details = details;
  }
  return body;
}

/**
 * Determines whether the current environment should suppress stack traces.
 */
function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/**
 * Fastify error handler that maps known error types to structured
 * JSON responses.
 *
 * Response envelope:
 * ```json
 * { "success": false, "error": { "code": "...", "message": "...", "details?": {} } }
 * ```
 *
 * Mapping rules:
 * - `ApiError` subclasses  -> their statusCode / code
 * - `ZodError`             -> 400 VALIDATION_ERROR
 * - Fastify parse errors   -> 400 INVALID_JSON
 * - Everything else        -> 500 INTERNAL_ERROR (no stack in production)
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // --- Known API errors ---
  if (error instanceof ValidationError) {
    void reply.status(error.statusCode).send(
      buildErrorResponse(error.code, error.message, error.details)
    );
    return;
  }

  if (error instanceof BusinessError) {
    void reply.status(error.statusCode).send(
      buildErrorResponse(error.code, error.message, error.details)
    );
    return;
  }

  if (error instanceof ApiError) {
    void reply
      .status(error.statusCode)
      .send(buildErrorResponse(error.code, error.message));
    return;
  }

  // --- Zod errors (thrown outside validate middleware) ---
  if (error instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
      details[path] = issue.message;
    }
    void reply
      .status(400)
      .send(buildErrorResponse('VALIDATION_ERROR', 'Validation failed', details));
    return;
  }

  // --- Fastify JSON parse errors ---
  if ('statusCode' in error && (error as FastifyError).statusCode === 400) {
    const fastifyError = error as FastifyError;
    // Fastify sets statusCode 400 for JSON parse failures
    if (
      fastifyError.code === 'FST_ERR_CTP_INVALID_CONTENT_LENGTH' ||
      fastifyError.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
      fastifyError.message?.includes('JSON')
    ) {
      void reply
        .status(400)
        .send(buildErrorResponse('INVALID_JSON', fastifyError.message));
      return;
    }

    // Other 400-level Fastify errors
    void reply
      .status(400)
      .send(
        buildErrorResponse(
          fastifyError.code ?? 'BAD_REQUEST',
          fastifyError.message
        )
      );
    return;
  }

  // --- Unexpected errors ---
  request.log.error(error, 'Unhandled error');

  const message = isProduction()
    ? 'An internal server error occurred'
    : error.message;

  void reply
    .status(500)
    .send(buildErrorResponse('INTERNAL_ERROR', message));
}
