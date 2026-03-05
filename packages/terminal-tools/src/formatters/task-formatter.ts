/**
 * Formats NormalizedTask arrays as Markdown tables for
 * conversational terminal display.
 */

import type { NormalizedTask } from '@iexcel/shared-types';

const DESCRIPTION_MAX_LENGTH = 60;

/**
 * Truncates a string to maxLength, appending "..." if truncated.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Converts an ISO 8601 duration string (e.g., "PT2H30M") to a
 * human-friendly format (e.g., "2h 30m"). Returns the raw string
 * if parsing fails.
 */
function formatDuration(iso: string | null): string {
  if (!iso) return '-';

  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) return iso;

  const hours = match[1] ?? '0';
  const minutes = match[2] ?? '00';
  return `${hours}h ${minutes.padStart(2, '0')}m`;
}

/**
 * Pads a string to exactly `width` characters (right-padded with spaces).
 */
function pad(text: string, width: number): string {
  return text.padEnd(width);
}

/**
 * Formats an array of NormalizedTask objects as a Markdown table.
 *
 * Columns: ID | Description | Time | Status
 *
 * Description is truncated at 60 characters.
 * Returns an empty-state message when the array is empty.
 */
export function formatTaskTable(
  tasks: NormalizedTask[],
  emptyMessage?: string
): string {
  if (tasks.length === 0) {
    return emptyMessage ?? 'No tasks found.';
  }

  // Calculate column widths
  const idWidth = Math.max(
    2,
    ...tasks.map((t) => t.shortId.length)
  );
  const descWidth = Math.max(
    11,
    ...tasks.map((t) => Math.min(t.title.length, DESCRIPTION_MAX_LENGTH))
  );
  const timeWidth = Math.max(
    4,
    ...tasks.map((t) => formatDuration(t.estimatedTime).length)
  );
  const statusWidth = Math.max(
    6,
    ...tasks.map((t) => t.status.length)
  );

  const header = `| ${pad('ID', idWidth)} | ${pad('Description', descWidth)} | ${pad('Time', timeWidth)} | ${pad('Status', statusWidth)} |`;
  const separator = `|${'-'.repeat(idWidth + 2)}|${'-'.repeat(descWidth + 2)}|${'-'.repeat(timeWidth + 2)}|${'-'.repeat(statusWidth + 2)}|`;

  const rows = tasks.map((task) => {
    const desc = truncate(task.title, DESCRIPTION_MAX_LENGTH);
    const time = formatDuration(task.estimatedTime);
    return `| ${pad(task.shortId, idWidth)} | ${pad(desc, descWidth)} | ${pad(time, timeWidth)} | ${pad(task.status, statusWidth)} |`;
  });

  return [header, separator, ...rows].join('\n');
}
