import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../../db/client';
import { ApiError } from '../../errors/api-errors';
import {
  isValidUuid,
  isValidDateString,
  listTranscriptsQuerySchema,
} from '../../validators/transcript-validators';
import { getClientById } from '../../services/client-service';
import { listTranscripts } from '../../repositories/transcript-repository';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidIdError(): ApiError {
  return new ApiError(400, 'INVALID_ID', 'The provided ID is not a valid UUID.');
}

function clientNotFoundError(): ApiError {
  return new ApiError(
    404,
    'CLIENT_NOT_FOUND',
    'The requested client does not exist or you do not have access to it.'
  );
}

function invalidPaginationError(message: string): ApiError {
  return new ApiError(400, 'INVALID_PAGINATION', message);
}

function invalidFilterError(message: string): ApiError {
  return new ApiError(400, 'INVALID_FILTER', message);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function registerListTranscripts(
  fastify: FastifyInstance,
  db: DbClient
): void {
  fastify.get(
    '/clients/:clientId/transcripts',
    async (
      request: FastifyRequest<{ Params: { clientId: string } }>,
      reply: FastifyReply
    ) => {
      const { clientId } = request.params;
      const user = request.user!;

      // 1. Validate UUID
      if (!isValidUuid(clientId)) {
        throw invalidIdError();
      }

      // 2. Access check
      const client = await getClientById(db, clientId, user.id, user.role);
      if (!client) {
        throw clientNotFoundError();
      }

      // 3. Parse and validate query parameters
      const queryResult = listTranscriptsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const firstIssue = queryResult.error.issues[0];
        const path = firstIssue?.path[0];

        // Distinguish pagination vs filter errors
        if (path === 'page' || path === 'per_page') {
          throw invalidPaginationError(
            firstIssue?.message ?? 'Invalid pagination parameters.'
          );
        }
        throw invalidFilterError(
          firstIssue?.message ?? 'Invalid filter parameters.'
        );
      }

      const { page, per_page: perPage, call_type: callType, from_date: fromDate, to_date: toDate } = queryResult.data;

      // 4. Validate date strings if provided
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

      // 5. Validate from_date <= to_date when both are supplied
      if (fromDate && toDate && fromDate > toDate) {
        throw invalidFilterError(
          'from_date must not be after to_date.'
        );
      }

      // 6. Execute query
      const result = await listTranscripts(db, {
        clientId,
        callType,
        fromDate,
        toDate,
        page,
        perPage,
      });

      const totalPages = perPage > 0 ? Math.ceil(result.total / perPage) : 0;

      // 7. Return response
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
