/**
 * Identifies the origin system of a transcript.
 * Union type (not enum) because new sources (Zoom, Teams, etc.)
 * are expected in V2 without requiring an enum update.
 */
export type TranscriptSource = 'grain' | 'manual';

/**
 * The type of meeting from which the transcript was generated.
 * Maps to the database call_type ENUM.
 */
export enum MeetingType {
  ClientCall = 'client_call',
  Intake = 'intake',
  FollowUp = 'follow_up',
}

/**
 * A single speaker segment within a transcript.
 */
export interface TranscriptSegment {
  /** Speaker name or identifier. e.g., "Mark", "Client" */
  speaker: string;
  /** Offset from recording start in seconds. */
  timestamp: number;
  /** Transcribed text for this segment. */
  text: string;
}

/**
 * A standardized transcript regardless of source system.
 * The input normalizer (feature 08) produces this shape.
 * The Mastra intake agent (feature 19) consumes this shape.
 */
export interface NormalizedTranscript {
  source: TranscriptSource;
  /** ID of the recording in the source system. e.g., Grain call ID. */
  sourceId: string;
  /** ISO 8601 datetime string. e.g., "2026-02-15T14:00:00Z" */
  meetingDate: string;
  clientId: string;
  meetingType: MeetingType;
  /** Participant names. Empty array if not known. */
  participants: string[];
  /** Total call duration in seconds. */
  durationSeconds: number;
  /** Ordered transcript segments. Empty array if no segmentation data. */
  segments: TranscriptSegment[];
  /** Optional agent-generated summary. Null if not generated. */
  summary: string | null;
  /** Optional key highlights. Null if not generated. */
  highlights: string[] | null;
}
