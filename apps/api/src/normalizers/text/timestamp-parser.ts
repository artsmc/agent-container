/**
 * Timestamp detection and seconds conversion.
 *
 * Supported formats:
 *   [HH:MM:SS]  (HH:MM:SS)  HH:MM:SS  MM:SS
 *   H:MM:SS     HH:MM:SS.mmm
 *
 * ReDoS-safe: no nested quantifiers; all groups are bounded.
 */

/**
 * Matches a timestamp at the start of a trimmed line.
 *
 * Capture groups:
 *   1 = first number (hours or minutes)
 *   2 = second number (minutes or seconds)
 *   3 = third number (seconds) — undefined for MM:SS format
 *
 * Optional leading bracket/paren, optional trailing bracket/paren,
 * optional decimal milliseconds (discarded).
 */
const TIMESTAMP_REGEX =
  /^[\[(]?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?[\])]?(?=\s|$)/;

/**
 * Convert regex match groups to integer seconds.
 *
 * - Three groups captured: HH:MM:SS -> hours*3600 + minutes*60 + seconds
 * - Two groups captured: MM:SS -> minutes*60 + seconds
 * - Milliseconds are truncated (not rounded).
 */
function timestampToSeconds(match: RegExpMatchArray): number {
  const g1 = match[1];
  const g2 = match[2];
  const g3 = match[3];

  if (g1 === undefined || g2 === undefined) {
    return 0;
  }

  if (g3 !== undefined) {
    // HH:MM:SS
    return parseInt(g1, 10) * 3600 + parseInt(g2, 10) * 60 + parseInt(g3, 10);
  }
  // MM:SS
  return parseInt(g1, 10) * 60 + parseInt(g2, 10);
}

/**
 * Parse a timestamp from the start of a line.
 *
 * @param line - A single trimmed line of transcript text.
 * @returns The timestamp in integer seconds, or null if no timestamp at line start.
 */
export function parseTimestampFromLine(line: string): number | null {
  const trimmed = line.trim();
  const match = TIMESTAMP_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }
  return timestampToSeconds(match);
}

/**
 * Strip a leading timestamp (and any trailing whitespace) from a line.
 * Returns the remaining text after the timestamp, or the original line if none found.
 */
export function stripTimestampFromLine(line: string): string {
  const trimmed = line.trim();
  return trimmed.replace(
    /^[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?[\])]?\s*/,
    ''
  );
}
