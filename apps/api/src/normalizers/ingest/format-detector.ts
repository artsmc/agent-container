/**
 * Transcript format detection.
 *
 * Detects the format of raw transcript text by matching structural patterns.
 * Detection order is most-specific first to avoid false positives.
 *
 * Reuses timestamp parsing from the existing text normalizer where applicable.
 */

import type { TranscriptFormat } from '@iexcel/shared-types';

/**
 * SRT pattern: a line matching HH:MM:SS,mmm --> HH:MM:SS,mmm
 * This is the definitive marker for SRT format (distinct from other timestamp styles).
 */
const SRT_TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/m;

/**
 * Turn-based pattern: lines starting with **Speaker Name**: text
 * This is the markdown bold-name format used by Grain and similar platforms.
 */
const TURNBASED_SPEAKER_RE = /^\*\*[^*]+\*\*\s*:/m;

/**
 * Detects the transcript format from raw text.
 *
 * Detection order (most specific first):
 * 1. SRT — has numbered sequences with `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamps
 * 2. Turn-based — has `**Speaker Name**: text` markdown speaker labels
 * 3. Raw — fallback (no speaker labels, no timestamps)
 *
 * Note: the existing text normalizer (normalizers/text) handles "Speaker: text"
 * patterns natively. This detector only distinguishes between the three *ingest*
 * format categories. When format is 'raw' or 'turnbased', the text normalizer's
 * buildSegments can often handle them directly.
 */
export function detectFormat(rawText: string): TranscriptFormat {
  // Check for SRT timestamp pattern (most specific)
  if (SRT_TIMESTAMP_RE.test(rawText)) {
    return 'srt';
  }

  // Check for turn-based markdown speaker labels
  if (TURNBASED_SPEAKER_RE.test(rawText)) {
    return 'turnbased';
  }

  // Fallback to raw
  return 'raw';
}
