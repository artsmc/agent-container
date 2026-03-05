/**
 * Converts an "hh:mm" interval string to the display format expected
 * by the Asana Estimated Time custom field.
 *
 * Two output formats are supported:
 * - `h_m`:    "2h 30m" (human-readable shorthand)
 * - `hh_mm`:  "02:30"  (zero-padded colon-separated)
 *
 * Returns null for null input or unparseable strings.
 */
export function formatEstimatedTime(
  interval: string | null,
  format: 'h_m' | 'hh_mm' = 'h_m',
): string | null {
  if (interval === null || interval === undefined) return null;

  const match = interval.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (format === 'h_m') {
    return `${hours}h ${minutes}m`;
  }

  // hh_mm format
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
