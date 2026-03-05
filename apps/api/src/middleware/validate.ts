import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ZodSchema, ZodIssue } from 'zod';
import { ValidationError } from '../errors/api-errors';

interface ValidateSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Formats Zod issues into a flat record keyed by field path.
 */
function formatZodIssues(
  issues: ZodIssue[],
  source: string
): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : source;
    details[`${source}.${path}`] = issue.message;
  }
  return details;
}

/**
 * Creates a Fastify preHandler hook that validates the request body,
 * query string, and/or route params against Zod schemas.
 *
 * On validation failure, throws a `ValidationError` with structured details.
 *
 * @example
 * ```ts
 * fastify.post('/tasks', {
 *   preHandler: validate({ body: createTaskSchema }),
 *   handler: createTaskHandler,
 * });
 * ```
 */
export function validate(schemas: ValidateSchemas) {
  return async function validateHook(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const allDetails: Record<string, string> = {};
    let hasErrors = false;

    if (schemas.body) {
      const result = schemas.body.safeParse(request.body);
      if (!result.success) {
        hasErrors = true;
        Object.assign(allDetails, formatZodIssues(result.error.issues, 'body'));
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(request.query);
      if (!result.success) {
        hasErrors = true;
        Object.assign(
          allDetails,
          formatZodIssues(result.error.issues, 'query')
        );
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(request.params);
      if (!result.success) {
        hasErrors = true;
        Object.assign(
          allDetails,
          formatZodIssues(result.error.issues, 'params')
        );
      }
    }

    if (hasErrors) {
      throw new ValidationError('Request validation failed', allDetails);
    }
  };
}
