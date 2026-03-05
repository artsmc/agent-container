/**
 * Converts an ISO 8601 datetime string to a relative time string
 * (e.g. "2 hours ago", "3 days ago").
 *
 * Uses `Intl.RelativeTimeFormat` for locale-aware formatting.
 */
export function formatRelativeTime(isoDatetime: string): string {
  const now = Date.now();
  const then = new Date(isoDatetime).getTime();
  const diffSeconds = Math.round((then - now) / 1000);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const absDiff = Math.abs(diffSeconds);

  if (absDiff < 60) {
    return rtf.format(diffSeconds, 'second');
  }
  if (absDiff < 3600) {
    return rtf.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (absDiff < 86400) {
    return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  }
  return rtf.format(Math.round(diffSeconds / 86400), 'day');
}

/**
 * Formats an ISO 8601 datetime string as an absolute date/time string
 * suitable for a tooltip.
 */
export function formatAbsoluteTime(isoDatetime: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoDatetime));
}
