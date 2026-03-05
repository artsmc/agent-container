/**
 * Core text transcript normalizer.
 *
 * Synchronous, pure function. No database, no network, no global state.
 * Given the same input, always returns the same NormalizedTranscript output.
 */

import type { NormalizedTranscript, MeetingType } from '@iexcel/shared-types';
import { ApiErrorCode } from '@iexcel/shared-types';
import { MeetingType as MeetingTypeEnum } from '@iexcel/shared-types';
import { buildSegments } from './segment-builder.js';
import { deduplicateParticipants } from './speaker-parser.js';
import { parseTimestampFromLine } from './timestamp-parser.js';
import { NormalizerError } from './errors.js';

/**
 * Input interface for the text normalizer.
 * Internal to the API layer; not exported from @iexcel/shared-types.
 */
export interface NormalizeTextInput {
  rawText: string;
  callType: MeetingType;
  callDate: string;
  clientId: string;
}

/** Valid MeetingType enum values for validation. */
const VALID_CALL_TYPES: ReadonlySet<string> = new Set(
  Object.values(MeetingTypeEnum)
);

/**
 * Validate that a date string conforms to ISO 8601 datetime format.
 * Requires the YYYY-MM-DDT prefix and must be parseable by Date.parse.
 */
function isValidIso8601(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
    return false;
  }
  const parsed = Date.parse(dateStr);
  return !isNaN(parsed);
}

/**
 * Validate all input fields. Throws NormalizerError on failure.
 */
function validateInput(input: NormalizeTextInput): void {
  if (!input.rawText || input.rawText.trim() === '') {
    throw new NormalizerError(
      ApiErrorCode.ValidationError,
      'Transcript text is required',
      'rawText'
    );
  }

  if (input.rawText.trim().length < 50) {
    throw new NormalizerError(
      ApiErrorCode.ValidationError,
      'Transcript text is too short to be valid',
      'rawText'
    );
  }

  if (!isValidIso8601(input.callDate)) {
    throw new NormalizerError(
      ApiErrorCode.ValidationError,
      'callDate must be a valid ISO 8601 datetime',
      'callDate'
    );
  }

  if (!VALID_CALL_TYPES.has(input.callType)) {
    throw new NormalizerError(
      ApiErrorCode.ValidationError,
      `callType must be one of: ${Array.from(VALID_CALL_TYPES).join(', ')}`,
      'callType'
    );
  }
}

/**
 * Normalize raw transcript text into a structured NormalizedTranscript.
 *
 * Steps:
 *   1. Validate inputs (throws on failure).
 *   2. Split rawText on line boundaries.
 *   3. Build segments via the segment builder.
 *   4. Extract and de-duplicate participants (excluding "Unknown").
 *   5. Calculate durationSeconds from min/max timestamps.
 *   6. Generate sourceId as manual-{clientId}-{YYYY-MM-DD}.
 *   7. Assemble and return the NormalizedTranscript.
 */
export function normalizeTextTranscript(
  input: NormalizeTextInput
): NormalizedTranscript {
  validateInput(input);

  const lines = input.rawText.split(/\r?\n/);
  const segments = buildSegments(lines);

  // Extract participants — exclude "Unknown" (used for unstructured fallback only)
  const allSpeakers = segments
    .map((s) => s.speaker)
    .filter((s) => s !== 'Unknown');
  const participants = deduplicateParticipants(allSpeakers);

  // Calculate duration from timestamp range.
  // First check segment timestamps; if insufficient (e.g., unstructured fallback),
  // scan raw lines for embedded timestamps to derive duration (FR-23, FR-34).
  let timestamps = segments.map((s) => s.timestamp).filter((t) => t > 0);
  if (timestamps.length < 2) {
    const lineTimestamps: number[] = [];
    for (const line of lines) {
      const ts = parseTimestampFromLine(line.trim());
      if (ts !== null) {
        lineTimestamps.push(ts);
      }
    }
    if (lineTimestamps.length > timestamps.length) {
      timestamps = lineTimestamps;
    }
  }
  const durationSeconds =
    timestamps.length >= 2
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : 0;

  // Generate sourceId
  const datePart = input.callDate.slice(0, 10);
  const sourceId = `manual-${input.clientId}-${datePart}`;

  return {
    source: 'manual',
    sourceId,
    meetingDate: input.callDate,
    clientId: input.clientId,
    meetingType: input.callType,
    participants,
    durationSeconds,
    segments,
    summary: null,
    highlights: null,
  };
}
