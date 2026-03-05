/**
 * Prompt helper functions for the Intake Agent.
 *
 * These utilities format transcript data into LLM-consumable text
 * and handle duration/time conversions.
 */
import type { NormalizedTranscript } from '@iexcel/shared-types';

/**
 * Formats a timestamp in seconds to HH:MM:SS format.
 *
 * @param seconds - Offset from recording start in seconds
 * @returns Formatted string like "00:14:32"
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Formats a duration in seconds to human-readable "Xh Ym" format.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string like "1h 27m" or "30m" (omits zero-hours)
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  if (h === 0 && m === 0) {
    return '0m';
  }
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

/**
 * Formats an ISO 8601 datetime string to human-readable date.
 * Example: "2026-02-15T14:00:00Z" -> "February 15, 2026"
 *
 * @param isoDate - ISO 8601 datetime string
 * @returns Human-readable date string
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Converts/normalizes an ISO 8601 duration string from LLM output.
 *
 * Handles:
 * - Pass-through of valid durations: "PT2H30M" -> "PT2H30M"
 * - Normalization of zero-hours: "PT0H30M" -> "PT30M"
 * - Normalization of zero-minutes: "PT2H0M" -> "PT2H"
 * - null -> null
 *
 * @param input - ISO 8601 duration string or null
 * @returns Normalized ISO 8601 duration string or null
 */
export function convertEstimatedTimeToDuration(
  input: string | null
): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  // Match ISO 8601 duration pattern PT[nH][nM]
  const match = input.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) {
    // If it doesn't match, return as-is (the schema validation will catch it)
    return input;
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);

  if (hours === 0 && minutes === 0) {
    return 'PT0M';
  }

  const parts = ['PT'];
  if (hours > 0) {
    parts.push(`${hours}H`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}M`);
  }
  return parts.join('');
}

/**
 * Builds the LLM user prompt from a NormalizedTranscript.
 *
 * The prompt includes meeting metadata, summary, highlights, and
 * full transcript segments formatted for LLM consumption.
 *
 * @param transcript - The normalized transcript to format
 * @returns Formatted prompt string
 */
export function buildIntakePrompt(transcript: NormalizedTranscript): string {
  const segments = transcript.segments
    .map((s) => `[${formatTimestamp(s.timestamp)}] ${s.speaker}: ${s.text}`)
    .join('\n');

  return [
    `Meeting Date: ${formatDate(transcript.meetingDate)}`,
    `Participants: ${transcript.participants.join(', ')}`,
    `Duration: ${formatDuration(transcript.durationSeconds)}`,
    transcript.summary ? `Summary:\n${transcript.summary}` : null,
    transcript.highlights?.length
      ? `Highlights:\n${transcript.highlights.map((h) => `- ${h}`).join('\n')}`
      : null,
    `\nFull Transcript:\n${segments || '(No segmented transcript available — use summary above)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
