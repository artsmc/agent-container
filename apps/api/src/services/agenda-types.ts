// ---------------------------------------------------------------------------
// Type definitions for the agenda service layer
// ---------------------------------------------------------------------------

/**
 * API response shape for an agenda summary (used in list endpoints).
 * Does NOT include content or versions array.
 */
export interface AgendaSummaryResponse {
  id: string;
  short_id: string;
  client_id: string;
  status: string;
  cycle_start: string | null;
  cycle_end: string | null;
  finalized_at: string | null;
  shared_at: string | null;
  google_doc_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * API response shape for a full agenda detail (includes versions).
 */
export interface AgendaDetailResponse extends AgendaSummaryResponse {
  content: unknown;
  shared_url_token: string | null;
  internal_url_token: string | null;
  finalized_by: string | null;
  versions: AgendaVersionResponse[];
}

/**
 * API response shape for an agenda version.
 */
export interface AgendaVersionResponse {
  id: string;
  version: number;
  content: unknown;
  edited_by: string | null;
  source: string;
  created_at: string;
}

/**
 * Public response shape for shared agendas (no internal fields).
 */
export interface PublicAgendaResponse {
  short_id: string;
  client_name: string;
  content: unknown;
  cycle_start: string | null;
  cycle_end: string | null;
  shared_at: string | null;
}
