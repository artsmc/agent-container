/**
 * Converts a duration in minutes to a human-readable display string.
 *
 * Examples:
 * - null  -> "\u2014"
 * - 0     -> "\u2014"
 * - 30    -> "30m"
 * - 60    -> "1h"
 * - 90    -> "1h 30m"
 * - 120   -> "2h"
 * - 150   -> "2h 30m"
 */
export function formatEstimatedTime(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return '\u2014';

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}
