import type {
  PaginationParams,
  PaginatedResponse,
  SubmitTranscriptRequest,
  GetTranscriptResponse,
} from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';

/**
 * Transcript endpoint methods.
 */
export function createTranscriptEndpoints(http: HttpTransport) {
  return {
    /**
     * List transcripts for a given client with optional pagination.
     * GET /clients/{id}/transcripts
     */
    listTranscripts(
      clientId: string,
      params?: PaginationParams
    ): Promise<PaginatedResponse<GetTranscriptResponse>> {
      return http.request({
        method: 'GET',
        path: `/clients/${clientId}/transcripts`,
        params: params as Record<string, string | number | boolean | undefined | null>,
      });
    },

    /**
     * Submit a new transcript for a client.
     * POST /clients/{id}/transcripts
     */
    submitTranscript(
      clientId: string,
      body: SubmitTranscriptRequest
    ): Promise<GetTranscriptResponse> {
      return http.request({
        method: 'POST',
        path: `/clients/${clientId}/transcripts`,
        body,
      });
    },

    /**
     * Get a single transcript by ID.
     * GET /transcripts/{id}
     */
    getTranscript(transcriptId: string): Promise<GetTranscriptResponse> {
      return http.request({
        method: 'GET',
        path: `/transcripts/${transcriptId}`,
      });
    },
  };
}

export type TranscriptEndpoints = ReturnType<typeof createTranscriptEndpoints>;
