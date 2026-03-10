import type {
  PaginationParams,
  PaginatedResponse,
  SubmitTranscriptRequest,
  GetTranscriptResponse,
  ListAllTranscriptsResponse,
} from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';

/** Query parameters for the global transcript listing endpoint. */
export interface ListAllTranscriptsParams {
  page?: number;
  per_page?: number;
  call_type?: string;
  from_date?: string;
  to_date?: string;
}

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
     * List all transcripts accessible to the authenticated user.
     * GET /transcripts
     */
    listAllTranscripts(
      params?: ListAllTranscriptsParams
    ): Promise<ListAllTranscriptsResponse> {
      return http.request({
        method: 'GET',
        path: '/transcripts',
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

    /**
     * Update a transcript (e.g. assign a client).
     * PATCH /transcripts/{id}
     */
    updateTranscript(
      transcriptId: string,
      body: { client_id?: string | null }
    ): Promise<GetTranscriptResponse> {
      return http.request({
        method: 'PATCH',
        path: `/transcripts/${transcriptId}`,
        body,
      });
    },

    /**
     * Parse raw transcript text into a structured transcript.
     * POST /transcripts/parse
     */
    parseTranscript(
      body: { rawText: string; clientId?: string; callType?: string; callDate?: string }
    ): Promise<{ transcriptId: string; versionId: string; format: string }> {
      return http.request({
        method: 'POST',
        path: '/transcripts/parse',
        body,
      });
    },
  };
}

export type TranscriptEndpoints = ReturnType<typeof createTranscriptEndpoints>;
