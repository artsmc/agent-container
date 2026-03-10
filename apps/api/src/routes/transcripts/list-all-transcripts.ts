import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../../db/client';
import { ApiError } from '../../errors/api-errors';
import {
  isValidDateString,
  listTranscriptsQuerySchema,
} from '../../validators/transcript-validators';
import { listAllTranscripts } from '../../repositories/transcript-repository';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidFilterError(message: string): ApiError {
  return new ApiError(400, 'INVALID_FILTER', message);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Registers the global transcript listing route.
 *
 * GET /transcripts - List all transcripts the authenticated user can access.
 * Admins see all; non-admins see transcripts for their assigned clients
 * plus unassigned transcripts (client_id IS NULL).
 */
export function registerListAllTranscripts(
  fastify: FastifyInstance,
  db: DbClient
): void {
  fastify.get(
    '/transcripts',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const user = request.user!;

      // 1. Parse and validate query parameters (reuse existing schema)
      const queryResult = listTranscriptsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const firstIssue = queryResult.error.issues[0];
        throw invalidFilterError(
          firstIssue?.message ?? 'Invalid query parameters.'
        );
      }

      const {
        page,
        per_page: perPage,
        call_type: callType,
        from_date: fromDate,
        to_date: toDate,
      } = queryResult.data;

      // 2. Validate date strings if provided
      if (fromDate !== undefined && !isValidDateString(fromDate)) {
        throw invalidFilterError(
          'from_date must be a valid date in YYYY-MM-DD format.'
        );
      }

      if (toDate !== undefined && !isValidDateString(toDate)) {
        throw invalidFilterError(
          'to_date must be a valid date in YYYY-MM-DD format.'
        );
      }

      if (fromDate && toDate && fromDate > toDate) {
        throw invalidFilterError(
          'from_date must not be after to_date.'
        );
      }

      // 3. Execute query
      const result = await listAllTranscripts(db, {
        userId: user.id,
        userRole: user.role,
        callType,
        fromDate,
        toDate,
        page,
        perPage,
      });

      const totalPages = perPage > 0 ? Math.ceil(result.total / perPage) : 0;

      // 4. Return response
      void reply.status(200).send({
        data: result.rows,
        pagination: {
          page,
          per_page: perPage,
          total: result.total,
          total_pages: totalPages,
        },
      });
    }
  );
}
