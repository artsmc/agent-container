import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../../db/client';
import { registerPostTranscript } from './post-transcript';
import { registerListTranscripts } from './list-transcripts';
import { registerGetTranscript } from './get-transcript';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

interface TranscriptRouteOptions {
  db: DbClient;
}

/**
 * Registers all transcript-related routes.
 *
 * Routes:
 * - POST   /clients/:clientId/transcripts    - Submit a transcript
 * - GET    /clients/:clientId/transcripts    - List transcripts for a client
 * - GET    /transcripts/:transcriptId        - Get transcript detail
 */
export async function transcriptRoutes(
  fastify: FastifyInstance,
  opts: TranscriptRouteOptions
): Promise<void> {
  const { db } = opts;

  registerPostTranscript(fastify, db);
  registerListTranscripts(fastify, db);
  registerGetTranscript(fastify, db);
}
