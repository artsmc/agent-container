import type { NormalizedTranscript } from '@iexcel/shared-types';
import type { CallTypeValue } from '../validators/transcript-validators';

// ---------------------------------------------------------------------------
// Full transcript record (returned by POST and GET detail)
// ---------------------------------------------------------------------------

export interface TranscriptRecord {
  id: string;
  client_id: string;
  grain_call_id: string | null;
  call_type: CallTypeValue;
  call_date: string;
  raw_transcript: string;
  normalized_segments: NormalizedTranscript;
  processed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Transcript summary (returned by GET list -- excludes heavy fields)
// ---------------------------------------------------------------------------

export interface TranscriptSummary {
  id: string;
  client_id: string;
  grain_call_id: string | null;
  call_type: CallTypeValue;
  call_date: string;
  processed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// List response shape
// ---------------------------------------------------------------------------

export interface ListTranscriptsResult {
  rows: TranscriptSummary[];
  total: number;
}

// ---------------------------------------------------------------------------
// Insert params
// ---------------------------------------------------------------------------

export interface InsertTranscriptParams {
  clientId: string;
  callType: CallTypeValue;
  callDate: string;
  rawTranscript: string;
  normalizedSegments: NormalizedTranscript;
}

// ---------------------------------------------------------------------------
// List query params
// ---------------------------------------------------------------------------

export interface ListTranscriptsParams {
  clientId: string;
  callType?: CallTypeValue;
  fromDate?: string;
  toDate?: string;
  page: number;
  perPage: number;
}

// ---------------------------------------------------------------------------
// Audit metadata shape for transcript submission
// ---------------------------------------------------------------------------

export interface TranscriptAuditMetadata {
  call_type: string;
  call_date: string;
  participant_count: number;
  segment_count: number;
  raw_transcript_length: number;
  submission_method: 'json' | 'file_upload';
}

/**
 * Builds audit metadata for a transcript submission.
 * Intentionally excludes raw transcript text (PII rule).
 */
export function buildTranscriptAuditMetadata(
  callType: string,
  callDate: string,
  normalizedSegments: NormalizedTranscript,
  rawTranscriptLength: number,
  submissionMethod: 'json' | 'file_upload'
): TranscriptAuditMetadata {
  return {
    call_type: callType,
    call_date: callDate,
    participant_count: normalizedSegments.participants.length,
    segment_count: normalizedSegments.segments.length,
    raw_transcript_length: rawTranscriptLength,
    submission_method: submissionMethod,
  };
}
