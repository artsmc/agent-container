/**
 * SRT segment builder.
 *
 * Parses SRT-formatted text into TranscriptSegment[].
 * Reuses the existing speaker-parser for speaker label extraction
 * from content lines.
 *
 * SRT block structure:
 * ```
 * 1
 * 00:00:00,480 --> 00:00:02,040
 * speaker name: Transcribed text here.
 * ```
 */

import type { TranscriptSegment } from '@iexcel/shared-types';
import { parseSpeakerFromLine } from '../text/speaker-parser.js';

/**
 * Matches an SRT timestamp line: `HH:MM:SS,mmm --> HH:MM:SS,mmm`
 */
const SRT_TIMESTAMP_RE =
  /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})$/;

/**
 * Converts HH:MM:SS,mmm components to total seconds (with millisecond precision).
 */
function toSeconds(h: string, m: string, s: string, ms: string): number {
  return (
    parseInt(h, 10) * 3600 +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(ms, 10) / 1000
  );
}

export interface SrtBuildResult {
  segments: TranscriptSegment[];
  participants: string[];
  durationSeconds: number;
}

/**
 * Build transcript segments from SRT-formatted text.
 *
 * Returns segments, de-duplicated participants, and duration derived
 * from the last end timestamp.
 */
export function buildSrtSegments(rawText: string): SrtBuildResult {
  const lines = rawText.split('\n');
  const segments: TranscriptSegment[] = [];
  const speakers = new Set<string>();
  let lastEndSeconds = 0;

  let i = 0;

  // Skip any header lines before the first sequence number
  while (i < lines.length && !/^\d+$/.test(lines[i].trim())) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (line === '') {
      i++;
      continue;
    }

    // Expect a sequence number
    if (!/^\d+$/.test(line)) {
      i++;
      continue;
    }

    i++; // Move past sequence number

    // Expect timestamp line
    if (i >= lines.length) break;
    const timestampLine = lines[i].trim();
    const tsMatch = timestampLine.match(SRT_TIMESTAMP_RE);

    if (!tsMatch) {
      i++;
      continue;
    }

    const startSeconds = toSeconds(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4]);
    const endSeconds = toSeconds(tsMatch[5], tsMatch[6], tsMatch[7], tsMatch[8]);
    lastEndSeconds = Math.max(lastEndSeconds, endSeconds);

    i++; // Move past timestamp line

    // Collect content lines until next empty line or end
    const contentParts: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      contentParts.push(lines[i].trim());
      i++;
    }

    const fullContent = contentParts.join(' ');

    // Use the existing speaker-parser for speaker extraction
    const speakerResult = parseSpeakerFromLine(fullContent);
    let speaker: string;
    let text: string;

    if (speakerResult) {
      speaker = speakerResult.speaker;
      text = speakerResult.remainingText.trim();
    } else {
      speaker = 'Unknown';
      text = fullContent;
    }

    speakers.add(speaker);

    segments.push({
      speaker,
      timestamp: startSeconds,
      text,
    });
  }

  // Participants exclude 'Unknown' (consistent with text normalizer)
  const participants = Array.from(speakers).filter((s) => s !== 'Unknown');

  return {
    segments,
    participants,
    durationSeconds: lastEndSeconds,
  };
}
