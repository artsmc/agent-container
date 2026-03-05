/**
 * Transcript truncation utility for terminal display.
 */

const TRANSCRIPT_MAX_LENGTH = 2000;

/**
 * Truncates transcript text at 2000 characters, appending a
 * note directing the user to the Web UI for the full version.
 *
 * @param text - The raw transcript text.
 * @param uiUrl - Optional URL to the full transcript in the Web UI.
 * @returns Truncated text with a fallback note, or the original if short enough.
 */
export function truncateTranscript(text: string, uiUrl?: string): string {
  if (text.length <= TRANSCRIPT_MAX_LENGTH) return text;

  const truncated = text.slice(0, TRANSCRIPT_MAX_LENGTH);
  const suffix = uiUrl
    ? `\n\n[Transcript truncated. Full version at ${uiUrl}]`
    : '\n\n[Transcript truncated. View the full version in the Web UI]';

  return truncated + suffix;
}
