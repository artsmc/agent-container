/**
 * Segment assembly: converts an array of transcript lines into
 * ordered TranscriptSegment[] by detecting speaker labels, extracting
 * timestamps, and merging continuation lines.
 */

import type { TranscriptSegment } from '@iexcel/shared-types';
import { parseTimestampFromLine, stripTimestampFromLine } from './timestamp-parser.js';
import { parseSpeakerFromLine } from './speaker-parser.js';

/** Internal intermediate representation for a parsed line. Not exported. */
interface ParsedLine {
  rawLine: string;
  timestamp: number | null;
  speaker: string | null;
  text: string;
}

/**
 * Parse a single trimmed line into its structured components.
 *
 * Order of extraction:
 *   1. Extract timestamp from the start of the line.
 *   2. Strip the timestamp to isolate the rest.
 *   3. Attempt speaker label extraction on the remaining text.
 */
function parseLine(line: string): ParsedLine {
  const timestamp = parseTimestampFromLine(line);
  const withoutTimestamp = stripTimestampFromLine(line);
  const speakerResult = parseSpeakerFromLine(withoutTimestamp);

  if (speakerResult) {
    return {
      rawLine: line,
      timestamp,
      speaker: speakerResult.speaker,
      text: speakerResult.remainingText.trim(),
    };
  }

  return {
    rawLine: line,
    timestamp,
    speaker: null,
    text: withoutTimestamp.trim(),
  };
}

/**
 * Build an ordered array of TranscriptSegment from raw transcript lines.
 *
 * Algorithm:
 *   - Skip blank lines.
 *   - On speaker label: flush current segment (if non-empty text), start new segment.
 *   - On continuation line: append text to current segment.
 *   - Track lastKnownTimestamp for inheritance (FR-22).
 *   - After loop: flush final segment.
 *
 * If no segments are produced (no speaker labels found), returns a single
 * "Unknown" fallback segment containing the full trimmed text of all lines.
 */
export function buildSegments(lines: string[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let currentSpeaker: string | null = null;
  let currentTimestamp = 0;
  let lastKnownTimestamp = 0;
  let currentTextLines: string[] = [];

  function flushSegment(): void {
    if (currentSpeaker !== null && currentTextLines.length > 0) {
      segments.push({
        speaker: currentSpeaker,
        timestamp: currentTimestamp,
        text: currentTextLines.join('\n').trim(),
      });
    }
    currentTextLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = parseLine(trimmed);

    if (parsed.speaker !== null) {
      // New speaker detected — flush the previous segment
      flushSegment();
      currentSpeaker = parsed.speaker;
      currentTimestamp = parsed.timestamp ?? lastKnownTimestamp;
      if (parsed.timestamp !== null) {
        lastKnownTimestamp = parsed.timestamp;
      }
      if (parsed.text) {
        currentTextLines.push(parsed.text);
      }
    } else {
      // Continuation line
      if (parsed.timestamp !== null) {
        lastKnownTimestamp = parsed.timestamp;
      }
      if (parsed.text) {
        currentTextLines.push(parsed.text);
      }
    }
  }

  // Flush the final segment
  flushSegment();

  // Unstructured fallback: no speaker labels found at all
  if (segments.length === 0) {
    const allText = lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n')
      .trim();

    if (allText.length > 0) {
      return [
        {
          speaker: 'Unknown',
          timestamp: 0,
          text: allText,
        },
      ];
    }
  }

  return segments;
}
