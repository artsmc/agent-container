/**
 * Parses an ISO 8601 duration string (e.g. "PT2H30M") into total minutes.
 * Returns `null` if the input is null or unparseable.
 */
export function parseIsoDurationToMinutes(
  duration: string | null
): number | null {
  if (!duration) return null;

  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}
