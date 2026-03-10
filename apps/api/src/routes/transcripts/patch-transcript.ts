import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../../db/client';
import { ApiError, ForbiddenError } from '../../errors/api-errors';
import { isValidUuid } from '../../validators/transcript-validators';
import { getClientById } from '../../services/client-service';
import {
  getTranscriptById,
  updateTranscriptClientId,
} from '../../repositories/transcript-repository';

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

interface PatchTranscriptParams {
  transcriptId: string;
}

interface PatchTranscriptBody {
  client_id?: string;
}

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidIdError(field: string): ApiError {
  return new ApiError(
    400,
    'INVALID_ID',
    `The provided ${field} is not a valid UUID.`
  );
}

function transcriptNotFoundError(): ApiError {
  return new ApiError(
    404,
    'TRANSCRIPT_NOT_FOUND',
    'The requested transcript does not exist.'
  );
}

function clientNotFoundError(): ApiError {
  return new ApiError(
    404,
    'CLIENT_NOT_FOUND',
    'The specified client does not exist.'
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function registerPatchTranscript(
  fastify: FastifyInstance,
  db: DbClient
): void {
  fastify.patch(
    '/transcripts/:transcriptId',
    async (
      request: FastifyRequest<{
        Params: PatchTranscriptParams;
        Body: PatchTranscriptBody;
      }>,
      reply: FastifyReply
    ) => {
      const { transcriptId } = request.params;
      const user = request.user!;
      const body = request.body as PatchTranscriptBody | undefined;

      // 1. Validate transcriptId UUID
      if (!isValidUuid(transcriptId)) {
        throw invalidIdError('transcriptId');
      }

      // 2. Only admins can reassign clients
      if (user.role !== 'admin') {
        throw new ForbiddenError(
          'Only admins can update transcript client assignment.'
        );
      }

      // 3. Validate body
      if (!body || typeof body !== 'object') {
        throw new ApiError(400, 'INVALID_BODY', 'Request body is required.');
      }

      // 4. Validate client_id if provided
      const clientId: string | null | undefined = body.client_id;

      if (clientId !== undefined) {
        if (typeof clientId !== 'string' || !isValidUuid(clientId)) {
          throw invalidIdError('client_id');
        }

        // 5. Verify the client exists
        const client = await getClientById(db, clientId, user.id, user.role);
        if (!client) {
          throw clientNotFoundError();
        }
      }

      // 6. Verify transcript exists
      const existing = await getTranscriptById(db, transcriptId);
      if (!existing) {
        throw transcriptNotFoundError();
      }

      // 7. If client_id was not provided in the body, nothing to update
      if (clientId === undefined) {
        void reply.status(200).send(existing);
        return;
      }

      // 8. Update the transcript's client_id
      const updated = await updateTranscriptClientId(
        db,
        transcriptId,
        clientId
      );

      if (!updated) {
        throw transcriptNotFoundError();
      }

      void reply.status(200).send(updated);
    }
  );
}
