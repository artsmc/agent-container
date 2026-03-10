import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../../db/client';
import type { WorkflowService } from '../../services/workflow.service';
import { registerPostTranscript } from './post-transcript';
import { registerListTranscripts } from './list-transcripts';
import { registerListAllTranscripts } from './list-all-transcripts';
import { registerGetTranscript } from './get-transcript';
import { registerPatchTranscript } from './patch-transcript';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

interface TranscriptRouteOptions {
  db: DbClient;
  workflowService: WorkflowService;
}

/**
 * Registers all transcript-related routes.
 *
 * Routes:
 * - POST   /clients/:clientId/transcripts    - Submit a transcript
 * - GET    /clients/:clientId/transcripts    - List transcripts for a client
 * - GET    /transcripts                      - List all accessible transcripts
 * - GET    /transcripts/:transcriptId        - Get transcript detail
 * - PATCH  /transcripts/:transcriptId        - Update transcript (admin only)
 */
export async function transcriptRoutes(
  fastify: FastifyInstance,
  opts: TranscriptRouteOptions
): Promise<void> {
  const { db, workflowService } = opts;

  registerPostTranscript(fastify, db, workflowService);
  registerListTranscripts(fastify, db);
  registerListAllTranscripts(fastify, db);
  registerGetTranscript(fastify, db);
  registerPatchTranscript(fastify, db);
}
