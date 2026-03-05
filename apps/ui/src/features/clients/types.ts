/**
 * View-model types for the Client Detail page tabs.
 *
 * These map to the API response shapes defined in TR.md Section 3.
 * The actual API calls return shared-types interfaces; these local
 * types are used when the shared-types don't match the view exactly.
 */

/** Summary row for the Tasks tab. Derived from NormalizedTask. */
export interface TaskSummaryRow {
  id: string
  shortId: string
  title: string
  status: 'draft' | 'approved' | 'rejected' | 'pushed' | 'completed'
  assignee: string | null
  createdAt: string
}

/** Summary card for the Agendas tab. Derived from Agenda. */
export interface AgendaSummaryRow {
  id: string
  shortId: string
  cycleStart: string
  cycleEnd: string
  status: 'draft' | 'in_review' | 'finalized' | 'shared'
  updatedAt: string
}

/** Summary row for the Transcripts tab. Derived from GetTranscriptResponse. */
export interface TranscriptSummaryRow {
  id: string
  callDate: string
  callType: string
  status: 'processed' | 'pending'
}

/** A single imported record for the History tab. */
export interface ImportedRecordRow {
  id: string
  recordType: string
  title: string | null
  importedAt: string
  sourceDescription: string
}

/** Asana project item for the Settings cascading dropdown. */
export interface AsanaProject {
  id: string
  name: string
}
