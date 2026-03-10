/**
 * Transcript Format Detection and Parsing
 *
 * Delegates to normalizers/ingest/ for format detection and parsing,
 * and normalizers/text/ for segment building.
 *
 * Usage:
 *   import { detectFormat, parseTranscript } from '../services/transcript';
 *
 *   const format = detectFormat(rawText);
 *   const normalized = parseTranscript({ rawText, format, callType, callDate, clientId });
 */

import type {
  TranscriptFormat,
  NormalizedTranscript,
  MeetingType,
} from '@iexcel/shared-types';
import { detectFormat, buildSrtSegments, preprocessTurnbased } from '../../normalizers/ingest/index.js';
import { buildSegments } from '../../normalizers/text/segment-builder.js';
import { deduplicateParticipants } from '../../normalizers/text/speaker-parser.js';
import { parseTimestampFromLine } from '../../normalizers/text/timestamp-parser.js';

export { detectFormat } from '../../normalizers/ingest/index.js';

export interface ParseTranscriptOptions {
  rawText: string;
  format: TranscriptFormat;
  callType: MeetingType;
  callDate: string;
  clientId: string;
}

/**
 * Parses raw transcript text into a NormalizedTranscript using the
 * appropriate normalizer pipeline based on detected format.
 *
 * - SRT: uses the dedicated SRT segment builder from normalizers/ingest
 * - Turnbased: preprocesses markdown bold syntax, then delegates to
 *   the text normalizer's buildSegments
 * - Raw: delegates directly to the text normalizer's buildSegments
 *   (falls back to a single "Unknown" segment)
 */
export function parseTranscript(options: ParseTranscriptOptions): NormalizedTranscript {
  const { rawText, format, callType, callDate, clientId } = options;

  switch (format) {
    case 'srt':
      return parseSrtFormat(rawText, callType, callDate, clientId);
    case 'turnbased':
      return parseTurnbasedFormat(rawText, callType, callDate, clientId);
    case 'raw':
      return parseRawFormat(rawText, callType, callDate, clientId);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown transcript format: ${_exhaustive}`);
    }
  }
}

/**
 * Convenience: detect format and parse in one call.
 */
export function detectAndParse(options: Omit<ParseTranscriptOptions, 'format'>): {
  format: TranscriptFormat;
  normalized: NormalizedTranscript;
} {
  const format = detectFormat(options.rawText);
  const normalized = parseTranscript({ ...options, format });
  return { format, normalized };
}

// ---------------------------------------------------------------------------
// Internal format handlers
// ---------------------------------------------------------------------------

function parseSrtFormat(
  rawText: string,
  callType: MeetingType,
  callDate: string,
  clientId: string
): NormalizedTranscript {
  const { segments, participants, durationSeconds } = buildSrtSegments(rawText);

  return {
    source: 'manual',
    sourceId: '',
    meetingDate: callDate,
    clientId,
    meetingType: callType,
    participants,
    durationSeconds,
    segments,
    summary: null,
    highlights: null,
  };
}

function parseTurnbasedFormat(
  rawText: string,
  callType: MeetingType,
  callDate: string,
  clientId: string
): NormalizedTranscript {
  // Strip markdown bold syntax so the existing text segment builder can parse it
  const preprocessed = preprocessTurnbased(rawText);
  const lines = preprocessed.split(/\r?\n/);
  const segments = buildSegments(lines);

  const allSpeakers = segments
    .map((s) => s.speaker)
    .filter((s) => s !== 'Unknown');
  const participants = deduplicateParticipants(allSpeakers);

  return {
    source: 'manual',
    sourceId: '',
    meetingDate: callDate,
    clientId,
    meetingType: callType,
    participants,
    durationSeconds: 0,
    segments,
    summary: null,
    highlights: null,
  };
}

function parseRawFormat(
  rawText: string,
  callType: MeetingType,
  callDate: string,
  clientId: string
): NormalizedTranscript {
  const lines = rawText.split(/\r?\n/);
  const segments = buildSegments(lines);

  // Scan for any timestamps in raw lines to derive duration
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

  return {
    source: 'manual',
    sourceId: '',
    meetingDate: callDate,
    clientId,
    meetingType: callType,
    participants: [],
    durationSeconds,
    segments,
    summary: null,
    highlights: null,
  };
}
