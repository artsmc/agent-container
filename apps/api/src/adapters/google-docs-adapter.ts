import { NotImplementedError } from '../errors/api-errors';

/**
 * Service contract for exporting agendas to Google Docs.
 * Feature 15 will provide the real implementation.
 */
export interface GoogleDocsAdapterService {
  exportAgenda(params: {
    agenda: {
      short_id: string;
      content: unknown;
      cycle_start: string | null;
      cycle_end: string | null;
    };
    client_name: string;
    existing_doc_id?: string | null;
  }): Promise<{ google_doc_id: string }>;
}

/**
 * Stub implementation that throws NotImplementedError.
 * To be replaced by Feature 15.
 */
export class GoogleDocsAdapterStub implements GoogleDocsAdapterService {
  async exportAgenda(
    _params: Parameters<GoogleDocsAdapterService['exportAgenda']>[0]
  ): Promise<{ google_doc_id: string }> {
    throw new NotImplementedError('GoogleDocsAdapter not implemented — Feature 15 pending');
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (can be replaced at runtime for testing or Feature 15)
// ---------------------------------------------------------------------------

let _googleDocsAdapter: GoogleDocsAdapterService = new GoogleDocsAdapterStub();

export function getGoogleDocsAdapter(): GoogleDocsAdapterService {
  return _googleDocsAdapter;
}

export function setGoogleDocsAdapter(adapter: GoogleDocsAdapterService): void {
  _googleDocsAdapter = adapter;
}
