import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../../db/client';
import { ApiError } from '../../errors/api-errors';
import { isValidUuid } from '../../validators/transcript-validators';
import { getClientById } from '../../services/client-service';
import { getTranscriptById } from '../../repositories/transcript-repository';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidIdError(): ApiError {
  return new ApiError(400, 'INVALID_ID', 'The provided ID is not a valid UUID.');
}

function transcriptNotFoundError(): ApiError {
  return new ApiError(
    404,
    'TRANSCRIPT_NOT_FOUND',
    'The requested transcript does not exist or you do not have access to it.'
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function registerGetTranscript(
  fastify: FastifyInstance,
  db: DbClient
): void {
  fastify.get(
    '/transcripts/:transcriptId',
    async (
      request: FastifyRequest<{ Params: { transcriptId: string } }>,
      reply: FastifyReply
    ) => {
      const { transcriptId } = request.params;
      const user = request.user!;

      // 1. Validate UUID
      if (!isValidUuid(transcriptId)) {
        throw invalidIdError();
      }

      // 2. Look up transcript
      const transcript = await getTranscriptById(db, transcriptId);
      if (!transcript) {
        throw transcriptNotFoundError();
      }

      // 3. Access check on the transcript's client (existence hiding)
      const client = await getClientById(
        db,
        transcript.client_id,
        user.id,
        user.role
      );
      if (!client) {
        throw transcriptNotFoundError();
      }

      // 4. Return full record
      void reply.status(200).send(transcript);
    }
  );
}
