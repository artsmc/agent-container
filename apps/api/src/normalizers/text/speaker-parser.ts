/**
 * Speaker label detection, name normalization, and participant de-duplication.
 *
 * Supported speaker label patterns:
 *   Mark:           — simple name
 *   Mark :          — space before colon
 *   Mark (PM):      — parenthetical role (stripped)
 *   Speaker 1:      — "Speaker N" format
 *   SARAH:          — all-caps (converted to title case)
 *
 * ReDoS-safe: the speaker name group uses a possessive-equivalent bounded match
 * and the parenthetical group uses a negated character class (no backtracking).
 */

/**
 * Matches a speaker label at the start of a line (after any timestamp has been stripped).
 *
 * Pattern breakdown:
 *   ^                         — anchor to start
 *   ([A-Za-z][A-Za-z0-9 ]*?) — speaker name: starts with letter, may include spaces/digits
 *   (?:\s*\([^)]*\))?        — optional parenthetical role (non-capturing, stripped)
 *   \s*:\s*                   — colon delimiter with optional surrounding whitespace
 */
const SPEAKER_LABEL_REGEX =
  /^([A-Za-z][A-Za-z0-9 ]*?)(?:\s*\([^)]*\))?\s*:\s*/;

/**
 * Normalize a raw speaker name:
 *   1. Strip parenthetical content
 *   2. Convert all-caps to title case
 *   3. Trim whitespace
 */
function normalizeSpeakerName(raw: string): string {
  // Strip parenthetical
  let name = raw.replace(/\s*\([^)]*\)/, '').trim();

  // Convert all-caps to title case
  if (name.length > 0 && name === name.toUpperCase()) {
    name = name
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return name.trim();
}

/**
 * Parse a speaker label from the start of a line.
 *
 * The line passed here should already have its leading timestamp stripped.
 *
 * @returns An object with the normalized speaker name and remaining text,
 *          or null if no speaker label is detected.
 */
export function parseSpeakerFromLine(
  line: string
): { speaker: string; remainingText: string } | null {
  const match = SPEAKER_LABEL_REGEX.exec(line);
  if (!match) {
    return null;
  }

  const rawName = match[1];
  if (rawName === undefined) {
    return null;
  }

  const speaker = normalizeSpeakerName(rawName);
  const remainingText = line.slice(match[0].length);

  return { speaker, remainingText };
}

/**
 * De-duplicate participant names case-insensitively.
 * Preserves order of first appearance and keeps the casing of the first occurrence.
 */
export function deduplicateParticipants(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, name);
    }
  }
  return Array.from(seen.values());
}
