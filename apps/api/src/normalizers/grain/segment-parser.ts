/**
 * Grain transcript segment parser.
 *
 * Converts Grain API transcript segments into TranscriptSegment[].
 * Handles:
 *   - Timestamp unit detection (ms vs s) and conversion to integer seconds.
 *   - Speaker name normalization (strip whitespace, remove parentheticals,
 *     all-caps to title case).
 *   - Empty segment filtering.
 *   - Participant de-duplication.
 */

import type { TranscriptSegment } from '@iexcel/shared-types';
import type { GrainSegment } from './grain-client.js';

// ---------------------------------------------------------------------------
// Speaker name normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a speaker name following Feature 08 conventions:
 *   1. Trim whitespace.
 *   2. Remove parenthetical content (e.g., "(PM)").
 *   3. Convert all-caps to title case.
 */
export function normalizeSpeakerName(raw: string): string {
  let name = raw.replace(/\s*\([^)]*\)/, '').trim();

  if (name.length > 0 && name === name.toUpperCase() && /[A-Z]/.test(name)) {
    name = name
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return name.trim();
}

// ---------------------------------------------------------------------------
// Timestamp conversion
// ---------------------------------------------------------------------------

/**
 * Detect whether a timestamp value is in milliseconds and convert to integer
 * seconds. Heuristic: if the value is >= 1000 and the recording duration in
 * seconds is available, we can check if the value greatly exceeds it.
 * As a simpler heuristic: if any segment timestamp > 100_000, assume ms.
 */
export function convertTimestamp(value: number, isMs: boolean): number {
  const seconds = isMs ? value / 1000 : value;
  return Math.max(0, Math.floor(seconds));
}

/**
 * Detect if timestamps in a set of segments appear to be in milliseconds.
 * Heuristic: if the max timestamp > 100_000, they are likely ms values.
 */
export function detectTimestampUnit(segments: GrainSegment[]): boolean {
  const maxTs = segments.reduce(
    (max, s) => Math.max(max, s.start_time),
    0
  );
  return maxTs > 100_000;
}

// ---------------------------------------------------------------------------
// Segment conversion
// ---------------------------------------------------------------------------

/**
 * Parse an array of Grain segments into ordered TranscriptSegments.
 * Filters out segments with empty or whitespace-only text.
 * Returns the de-duplicated participant list alongside the segments.
 */
export function parseGrainSegments(grainSegments: GrainSegment[]): {
  segments: TranscriptSegment[];
  participants: string[];
} {
  const isMs = detectTimestampUnit(grainSegments);
  const segments: TranscriptSegment[] = [];
  const participantMap = new Map<string, string>();

  for (const seg of grainSegments) {
    // Filter empty text
    const text = (seg.text ?? '').trim();
    if (!text) continue;

    const speaker = normalizeSpeakerName(seg.speaker ?? 'Unknown');
    const timestamp = convertTimestamp(seg.start_time, isMs);

    segments.push({ speaker, timestamp, text });

    // De-duplicate participants case-insensitively
    const key = speaker.toLowerCase();
    if (!participantMap.has(key)) {
      participantMap.set(key, speaker);
    }
  }

  return {
    segments,
    participants: Array.from(participantMap.values()),
  };
}
