/**
 * Response shape for the public shared agenda endpoint.
 * GET /shared/{token}
 *
 * This is a de-normalized, client-safe view of a finalized agenda.
 * It includes the client name (resolved from the client relationship)
 * and structured running notes sections.
 */
export interface SharedAgendaRunningNotes {
  completed_tasks: string;
  incomplete_tasks: string;
  relevant_deliverables: string;
  recommendations: string;
  new_ideas: string;
  next_steps: string;
}

export interface SharedAgendaResponse {
  agenda_id: string;
  short_id: string;
  client_name: string;
  /** ISO 8601 date string, e.g. "2026-02-01" */
  cycle_start: string;
  /** ISO 8601 date string, e.g. "2026-02-28" */
  cycle_end: string;
  /** ISO 8601 datetime string, e.g. "2026-02-28T14:30:00Z" */
  finalized_at: string;
  running_notes: SharedAgendaRunningNotes;
  /** ISO 8601 datetime string or null if the token does not expire */
  token_expires_at: string | null;
}
